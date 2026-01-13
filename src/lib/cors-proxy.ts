export interface CORSProxyConfig {
  name: string
  url: (targetUrl: string) => string
  priority: number
  description: string
}

export const CORS_PROXIES: CORSProxyConfig[] = [
  {
    name: 'corsproxy.io',
    url: (target) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
    priority: 1,
    description: 'Fast, reliable CORS proxy with good uptime'
  },
  {
    name: 'cors-anywhere (herokuapp)',
    url: (target) => `https://cors-anywhere.herokuapp.com/${target}`,
    priority: 2,
    description: 'Popular open-source CORS proxy'
  },
  {
    name: 'allorigins',
    url: (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    priority: 3,
    description: 'Alternative proxy with good reliability'
  },
  {
    name: 'thingproxy',
    url: (target) => `https://thingproxy.freeboard.io/fetch/${target}`,
    priority: 4,
    description: 'Lightweight CORS proxy by Freeboard'
  },
  {
    name: 'cors.sh',
    url: (target) => `https://cors.sh/${target}`,
    priority: 5,
    description: 'Simple CORS proxy with minimal overhead'
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
  maxRetries: number = 3
): Promise<Response> {
  const shouldUseCorsProxy = !targetUrl.includes('localhost') && 
                             !targetUrl.includes('127.0.0.1') &&
                             !targetUrl.startsWith('file://')

  if (!shouldUseCorsProxy) {
    return fetch(targetUrl, options)
  }

  let lastError: Error | null = null
  const availableProxies = CORS_PROXIES.slice()

  for (let attempt = 0; attempt < Math.min(maxRetries, availableProxies.length); attempt++) {
    const proxy = corsProxyManager.getCurrentProxy()
    const proxyUrl = proxy.url(targetUrl)
    const startTime = performance.now()

    console.log(`[CORS Proxy] Attempt ${attempt + 1}/${maxRetries} using ${proxy.name}`)
    console.log(`[CORS Proxy] Target: ${targetUrl}`)
    console.log(`[CORS Proxy] Proxied: ${proxyUrl}`)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(proxyUrl, {
        ...options,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      const responseTime = performance.now() - startTime

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      corsProxyManager.recordSuccess(proxy.name, responseTime)
      return response

    } catch (error) {
      const responseTime = performance.now() - startTime
      lastError = error instanceof Error ? error : new Error(String(error))
      
      corsProxyManager.recordFailure(
        proxy.name, 
        lastError.message.slice(0, 100)
      )

      if (attempt < Math.min(maxRetries, availableProxies.length) - 1) {
        const backoffDelay = Math.min(1000, 200 * Math.pow(2, attempt))
        console.log(`[CORS Proxy] Waiting ${backoffDelay}ms before next attempt...`)
        await new Promise(resolve => setTimeout(resolve, backoffDelay))
      }
    }
  }

  throw new Error(
    `All CORS proxies failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown'}. ` +
    `Try using a different RPC endpoint or check your network connection.`
  )
}

export async function fetchJSONWithCORSProxy(
  targetUrl: string,
  body: any,
  maxRetries: number = 3
): Promise<any> {
  const response = await fetchWithCORSProxy(
    targetUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    maxRetries
  )

  const contentType = response.headers.get('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text()
    throw new Error(`RPC endpoint returned non-JSON response: ${text.slice(0, 200)}`)
  }

  const data = await response.json()

  if (data.error) {
    throw new Error(
      `RPC Error ${data.error.code || 'UNKNOWN'}: ${data.error.message || 'Unknown error'}`
    )
  }

  return data
}
