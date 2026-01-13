export interface CORSProxyConfig {
  name: string
  url: (targetUrl: string) => string
  priority: number
  description: string
}

export const CORS_PROXIES: CORSProxyConfig[] = [
  {
    name: 'thingproxy.freeboard.io',
    url: (target) => `https://thingproxy.freeboard.io/fetch/${target}`,
    priority: 1,
    description: 'Reliable CORS proxy with good uptime'
  },
  {
    name: 'api.allorigins.win',
    url: (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    priority: 2,
    description: 'AllOrigins proxy service'
  },
  {
    name: 'api.codetabs.com',
    url: (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    priority: 3,
    description: 'CodeTabs proxy with decent reliability'
  },
  {
    name: 'cors-proxy.htmldriven.com',
    url: (target) => `https://cors-proxy.htmldriven.com/?url=${encodeURIComponent(target)}`,
    priority: 4,
    description: 'HTML Driven CORS proxy'
  }
]

export interface ProxyState {
  proxy: CORSProxyConfig
  failures: number
  lastFailure?: number
  lastSuccess?: number
  avgResponseTime: number
  totalRequests: number
}

class CORSProxyManager {
  private proxyStates: Map<string, ProxyState> = new Map()
  private currentProxyIndex: number = 0
  private maxFailuresBeforeSwitch: number = 3
  private proxyBlacklistDuration: number = 5 * 60 * 1000

  constructor() {
    CORS_PROXIES.forEach(proxy => {
      this.proxyStates.set(proxy.name, {
        proxy,
        failures: 0,
        avgResponseTime: 0,
        totalRequests: 0
      })
    })
  }

  private isProxyBlacklisted(state: ProxyState): boolean {
    if (!state.lastFailure) return false
    const timeSinceFailure = Date.now() - state.lastFailure
    return state.failures >= this.maxFailuresBeforeSwitch && 
           timeSinceFailure < this.proxyBlacklistDuration
  }

  private getAvailableProxies(): CORSProxyConfig[] {
    return CORS_PROXIES.filter(proxy => {
      const state = this.proxyStates.get(proxy.name)
      return state && !this.isProxyBlacklisted(state)
    }).sort((a, b) => {
      const stateA = this.proxyStates.get(a.name)!
      const stateB = this.proxyStates.get(b.name)!
      
      if (stateA.lastSuccess && !stateB.lastSuccess) return -1
      if (!stateA.lastSuccess && stateB.lastSuccess) return 1
      
      if (stateA.failures !== stateB.failures) {
        return stateA.failures - stateB.failures
      }
      
      return a.priority - b.priority
    })
  }

  getCurrentProxy(): CORSProxyConfig {
    const available = this.getAvailableProxies()
    
    if (available.length === 0) {
      console.warn('[CORS Proxy] All proxies blacklisted, resetting failures')
      this.proxyStates.forEach(state => {
        state.failures = 0
        state.lastFailure = undefined
      })
      return CORS_PROXIES[0]
    }

    return available[0]
  }

  recordSuccess(proxyName: string, responseTime: number) {
    const state = this.proxyStates.get(proxyName)
    if (!state) return

    state.failures = 0
    state.lastSuccess = Date.now()
    state.totalRequests++
    
    if (state.avgResponseTime === 0) {
      state.avgResponseTime = responseTime
    } else {
      state.avgResponseTime = (state.avgResponseTime * 0.8) + (responseTime * 0.2)
    }

    console.log(`[CORS Proxy] ✓ ${proxyName} succeeded (${responseTime}ms, avg: ${Math.round(state.avgResponseTime)}ms)`)
  }

  recordFailure(proxyName: string, error: string) {
    const state = this.proxyStates.get(proxyName)
    if (!state) return

    state.failures++
    state.lastFailure = Date.now()

    console.warn(`[CORS Proxy] ✗ ${proxyName} failed (${state.failures}/${this.maxFailuresBeforeSwitch}): ${error}`)

    if (state.failures >= this.maxFailuresBeforeSwitch) {
      console.warn(`[CORS Proxy] Blacklisting ${proxyName} for ${this.proxyBlacklistDuration / 1000}s`)
    }
  }

  getStats(): { proxy: string; failures: number; avgResponseTime: number; totalRequests: number }[] {
    return Array.from(this.proxyStates.values()).map(state => ({
      proxy: state.proxy.name,
      failures: state.failures,
      avgResponseTime: Math.round(state.avgResponseTime),
      totalRequests: state.totalRequests
    }))
  }

  reset() {
    this.proxyStates.forEach(state => {
      state.failures = 0
      state.lastFailure = undefined
      state.lastSuccess = undefined
    })
    console.log('[CORS Proxy] Manager reset')
  }
}

export const corsProxyManager = new CORSProxyManager()

export async function fetchWithCORSProxy(
  targetUrl: string,
  options: RequestInit = {},
  maxRetries: number = 5
): Promise<Response> {
  const shouldUseCorsProxy = !targetUrl.includes('localhost') && 
                             !targetUrl.includes('127.0.0.1') &&
                             !targetUrl.startsWith('file://')

  if (!shouldUseCorsProxy) {
    return fetch(targetUrl, options)
  }

  let lastError: Error | null = null
  let triedDirect = false

  if (!triedDirect) {
    console.log(`[CORS Proxy] Attempting direct connection first...`)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const response = await fetch(targetUrl, {
        ...options,
        signal: controller.signal,
        mode: 'cors',
        cache: 'no-cache'
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        console.log(`[CORS Proxy] ✓ Direct connection succeeded!`)
        return response
      }
    } catch (error) {
      console.log(`[CORS Proxy] Direct connection failed, using proxies...`)
      lastError = error instanceof Error ? error : new Error(String(error))
    }
    triedDirect = true
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const proxy = corsProxyManager.getCurrentProxy()
    const proxyUrl = proxy.url(targetUrl)
    const startTime = performance.now()

    console.log(`[CORS Proxy] Attempt ${attempt + 1}/${maxRetries} using ${proxy.name}`)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20000)

      const response = await fetch(proxyUrl, {
        method: options.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: options.body,
        signal: controller.signal,
        mode: 'cors',
        cache: 'no-cache'
      })

      clearTimeout(timeoutId)
      const responseTime = performance.now() - startTime

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      corsProxyManager.recordSuccess(proxy.name, responseTime)
      console.log(`[CORS Proxy] ✓ Success with ${proxy.name} (${responseTime.toFixed(0)}ms)`)
      return response

    } catch (error) {
      const responseTime = performance.now() - startTime
      lastError = error instanceof Error ? error : new Error(String(error))
      
      corsProxyManager.recordFailure(
        proxy.name, 
        lastError.message.slice(0, 100)
      )

      if (attempt < maxRetries - 1) {
        const backoffDelay = Math.min(2000, 300 * Math.pow(1.5, attempt))
        console.log(`[CORS Proxy] Waiting ${backoffDelay.toFixed(0)}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, backoffDelay))
      }
    }
  }

  throw new Error(
    `All ${maxRetries} proxy attempts failed. Last error: ${lastError?.message || 'Unknown'}. ` +
    `Try: 1) Use a different RPC endpoint, 2) Check your API key, 3) Verify network connection. ` +
    `Recommended: https://rpc.ankr.com/eth or https://ethereum.publicnode.com`
  )
}

export async function fetchJSONWithCORSProxy(
  targetUrl: string,
  body: any,
  maxRetries: number = 5
): Promise<any> {
  const response = await fetchWithCORSProxy(
    targetUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body),
    },
    maxRetries
  )

  const contentType = response.headers.get('content-type') || ''
  let responseText = ''
  
  try {
    responseText = await response.text()
  } catch (e) {
    throw new Error('Failed to read response from RPC endpoint')
  }
  
  if (!responseText || responseText.trim() === '') {
    throw new Error('RPC endpoint returned empty response')
  }
  
  if (responseText.includes('<!DOCTYPE') || responseText.includes('<html') || responseText.includes('<HTML')) {
    throw new Error(
      `RPC endpoint returned HTML instead of JSON (likely blocked or misconfigured). ` +
      `Please verify: 1) URL is correct, 2) Endpoint requires auth (add API key), ` +
      `3) Try a different RPC like https://rpc.ankr.com/eth`
    )
  }

  let data: any
  try {
    data = JSON.parse(responseText)
  } catch (parseError) {
    throw new Error(
      `Invalid JSON response from RPC. ` +
      `Response preview: ${responseText.slice(0, 150)}...`
    )
  }

  if (data.error) {
    const errorCode = data.error.code || 'UNKNOWN'
    const errorMessage = data.error.message || JSON.stringify(data.error)
    
    if (errorCode === -32602) {
      throw new Error(
        `RPC parameter error: ${errorMessage}. ` +
        `This usually means invalid block number format or missing params.`
      )
    }
    
    if (errorCode === -32000) {
      throw new Error(
        `RPC server error: ${errorMessage}. ` +
        `The node may be rate limiting, out of sync, or rejecting the query.`
      )
    }

    if (errorCode === -32601) {
      throw new Error(
        `Method not found: ${errorMessage}. ` +
        `This RPC endpoint may not support the requested method.`
      )
    }

    if (errorCode === -32700) {
      throw new Error(
        `Parse error: ${errorMessage}. ` +
        `The RPC request JSON was malformed.`
      )
    }
    
    throw new Error(`RPC Error ${errorCode}: ${errorMessage}`)
  }

  if (!data.result && data.result !== null && data.result !== 0) {
    throw new Error(
      `RPC response missing 'result' field. Response: ${JSON.stringify(data).slice(0, 150)}...`
    )
  }

  return data
}
