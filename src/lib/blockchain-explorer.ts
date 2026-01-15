export interface ExplorerTransaction {
  hash: string
  from: string
  to: string
  value: string
  blockNumber: number
  timestamp: number
  input: string
  r?: string
  s?: string
  v?: string
}

export interface ExplorerConfig {
  name: string
  baseUrl: string
  apiKey?: string
  rateLimitMs: number
  supportedChains: string[]
}

export interface FetchTransactionsParams {
  address: string
  chain?: 'ethereum' | 'bitcoin' | 'bitcoin-testnet'
  limit?: number
  offset?: number
}

const EXPLORERS: Record<string, ExplorerConfig> = {
  blockchair: {
    name: 'Blockchair',
    baseUrl: 'https://api.blockchair.com',
    rateLimitMs: 300,
    supportedChains: ['bitcoin', 'ethereum', 'bitcoin-testnet']
  },
  blockchain: {
    name: 'Blockchain.com',
    baseUrl: 'https://blockchain.info',
    rateLimitMs: 500,
    supportedChains: ['bitcoin']
  },
  blockcypher: {
    name: 'BlockCypher',
    baseUrl: 'https://api.blockcypher.com/v1',
    rateLimitMs: 200,
    supportedChains: ['bitcoin', 'ethereum', 'bitcoin-testnet']
  }
}

export class BlockchainExplorer {
  private lastRequestTime = 0
  private requestQueue: Array<() => Promise<any>> = []
  private isProcessingQueue = false

  private async rateLimitedFetch(url: string, rateLimitMs: number): Promise<Response> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    
    if (timeSinceLastRequest < rateLimitMs) {
      await new Promise(resolve => setTimeout(resolve, rateLimitMs - timeSinceLastRequest))
    }
    
    this.lastRequestTime = Date.now()
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        }
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  async fetchTransactionsBlockchair(params: FetchTransactionsParams): Promise<ExplorerTransaction[]> {
    const { address, chain = 'bitcoin', limit = 50, offset = 0 } = params
    const config = EXPLORERS.blockchair
    
    try {
      const url = `${config.baseUrl}/${chain}/dashboards/address/${address}?limit=${limit}&offset=${offset}`
      const response = await this.rateLimitedFetch(url, config.rateLimitMs)
      
      if (!response.ok) {
        throw new Error(`Blockchair API error: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (!data.data || !data.data[address]) {
        return []
      }
      
      const addressData = data.data[address]
      const transactions = addressData.transactions || []
      
      return transactions.map((tx: any) => ({
        hash: tx.hash,
        from: tx.inputs?.[0]?.recipient || address,
        to: tx.outputs?.[0]?.recipient || '',
        value: tx.output_total?.toString() || '0',
        blockNumber: tx.block_id || 0,
        timestamp: new Date(tx.time).getTime(),
        input: tx.witness_hex || ''
      }))
    } catch (error) {
      console.error('Blockchair fetch error:', error)
      throw error
    }
  }

  async fetchTransactionsBlockchainInfo(params: FetchTransactionsParams): Promise<ExplorerTransaction[]> {
    const { address, limit = 50, offset = 0 } = params
    const config = EXPLORERS.blockchain
    
    try {
      const url = `${config.baseUrl}/rawaddr/${address}?limit=${limit}&offset=${offset}`
      const response = await this.rateLimitedFetch(url, config.rateLimitMs)
      
      if (!response.ok) {
        throw new Error(`Blockchain.com API error: ${response.status}`)
      }
      
      const data = await response.json()
      const transactions = data.txs || []
      
      return transactions.map((tx: any) => ({
        hash: tx.hash,
        from: tx.inputs?.[0]?.prev_out?.addr || address,
        to: tx.out?.[0]?.addr || '',
        value: tx.out?.[0]?.value?.toString() || '0',
        blockNumber: tx.block_height || 0,
        timestamp: tx.time * 1000,
        input: ''
      }))
    } catch (error) {
      console.error('Blockchain.com fetch error:', error)
      throw error
    }
  }

  async fetchTransactionsBlockCypher(params: FetchTransactionsParams): Promise<ExplorerTransaction[]> {
    const { address, chain = 'bitcoin', limit = 50 } = params
    const config = EXPLORERS.blockcypher
    
    try {
      const chainPath = chain === 'bitcoin' ? 'btc/main' : chain === 'bitcoin-testnet' ? 'btc/test3' : 'eth/main'
      const url = `${config.baseUrl}/${chainPath}/addrs/${address}/full?limit=${limit}`
      const response = await this.rateLimitedFetch(url, config.rateLimitMs)
      
      if (!response.ok) {
        throw new Error(`BlockCypher API error: ${response.status}`)
      }
      
      const data = await response.json()
      const transactions = data.txs || []
      
      return transactions.map((tx: any) => ({
        hash: tx.hash,
        from: tx.inputs?.[0]?.addresses?.[0] || address,
        to: tx.outputs?.[0]?.addresses?.[0] || '',
        value: tx.total?.toString() || '0',
        blockNumber: tx.block_height || 0,
        timestamp: new Date(tx.received).getTime(),
        input: tx.hex || ''
      }))
    } catch (error) {
      console.error('BlockCypher fetch error:', error)
      throw error
    }
  }

  async fetchTransactions(params: FetchTransactionsParams): Promise<ExplorerTransaction[]> {
    const explorers = [
      () => this.fetchTransactionsBlockchair(params),
      () => this.fetchTransactionsBlockchainInfo(params),
      () => this.fetchTransactionsBlockCypher(params)
    ]

    for (const fetchFn of explorers) {
      try {
        const transactions = await fetchFn()
        if (transactions.length > 0) {
          return transactions
        }
      } catch (error) {
        console.warn('Explorer failed, trying next...', error)
        continue
      }
    }

    throw new Error('All blockchain explorers failed to fetch transactions')
  }

  async fetchAddressInfo(address: string, chain?: string): Promise<{
    address: string
    balance: string
    totalTransactions: number
    transactions: ExplorerTransaction[]
  }> {
    try {
      const transactions = await this.fetchTransactions({ address, chain: chain as any, limit: 100 })
      
      return {
        address,
        balance: '0',
        totalTransactions: transactions.length,
        transactions
      }
    } catch (error) {
      console.error('Error fetching address info:', error)
      throw error
    }
  }

  extractSignatureFromTransaction(tx: ExplorerTransaction): {
    r: string
    s: string
    v?: string
    z: string
  } | null {
    try {
      if (tx.r && tx.s) {
        return {
          r: tx.r,
          s: tx.s,
          v: tx.v,
          z: tx.hash
        }
      }

      if (tx.input && tx.input.length > 130) {
        const sig = tx.input.slice(-130)
        const r = '0x' + sig.slice(0, 64)
        const s = '0x' + sig.slice(64, 128)
        const v = '0x' + sig.slice(128, 130)
        
        return {
          r,
          s,
          v,
          z: tx.hash
        }
      }

      return null
    } catch (error) {
      console.error('Error extracting signature:', error)
      return null
    }
  }

  async analyzeAddressSignatures(address: string, chain?: string): Promise<{
    signatures: Array<{
      r: string
      s: string
      z: string
      txid: string
      blockNumber: number
      timestamp: number
    }>
    totalTransactions: number
    signaturesFound: number
  }> {
    const addressInfo = await this.fetchAddressInfo(address, chain)
    const signatures: Array<{
      r: string
      s: string
      z: string
      txid: string
      blockNumber: number
      timestamp: number
    }> = []

    for (const tx of addressInfo.transactions) {
      const sig = this.extractSignatureFromTransaction(tx)
      if (sig) {
        signatures.push({
          r: sig.r,
          s: sig.s,
          z: sig.z,
          txid: tx.hash,
          blockNumber: tx.blockNumber,
          timestamp: tx.timestamp
        })
      }
    }

    return {
      signatures,
      totalTransactions: addressInfo.totalTransactions,
      signaturesFound: signatures.length
    }
  }
}

export const blockchainExplorer = new BlockchainExplorer()
