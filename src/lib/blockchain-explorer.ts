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
  inputs?: any[]
  outputs?: any[]
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
      const url = `${config.baseUrl}/${chain}/dashboards/address/${address}?limit=${limit}&offset=${offset}&transaction_details=true`
      const response = await this.rateLimitedFetch(url, config.rateLimitMs)
      
      if (!response.ok) {
        throw new Error(`Blockchair API error: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (!data.data || !data.data[address]) {
        return []
      }
      
      const addressData = data.data[address]
      const transactionsList = addressData.transactions || []
      const transactionsData = data.data || {}
      
      const results: ExplorerTransaction[] = []
      
      for (const txHash of transactionsList.slice(0, Math.min(limit, transactionsList.length))) {
        const txInfo = transactionsData[txHash]
        
        if (!txInfo || !txInfo.transaction) {
          continue
        }
        
        const tx = txInfo.transaction
        const inputs = txInfo.inputs || []
        const outputs = txInfo.outputs || []
        
        results.push({
          hash: txHash,
          from: inputs[0]?.recipient || address,
          to: outputs[0]?.recipient || '',
          value: tx.output_total?.toString() || '0',
          blockNumber: tx.block_id || 0,
          timestamp: new Date(tx.time).getTime(),
          input: '',
          inputs: inputs,
          outputs: outputs
        })
      }
      
      return results
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
        input: '',
        inputs: tx.inputs || [],
        outputs: tx.out || []
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
        input: tx.hex || '',
        inputs: tx.inputs || [],
        outputs: tx.outputs || []
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

  parseDERSignature(derSig: string): { r: string, s: string } | null {
    try {
      let hex = derSig
      if (hex.startsWith('0x')) {
        hex = hex.slice(2)
      }
      
      if (hex.length < 8) return null
      
      if (hex.substring(0, 2) !== '30') {
        return null
      }
      
      let pos = 4
      
      if (hex.substring(pos, pos + 2) !== '02') {
        return null
      }
      pos += 2
      
      const rLen = parseInt(hex.substring(pos, pos + 2), 16) * 2
      pos += 2
      
      const r = hex.substring(pos, pos + rLen)
      pos += rLen
      
      if (hex.substring(pos, pos + 2) !== '02') {
        return null
      }
      pos += 2
      
      const sLen = parseInt(hex.substring(pos, pos + 2), 16) * 2
      pos += 2
      
      const s = hex.substring(pos, pos + sLen)
      
      const cleanR = r.startsWith('00') ? r.substring(2) : r
      const cleanS = s.startsWith('00') ? s.substring(2) : s
      
      return {
        r: '0x' + cleanR.padStart(64, '0'),
        s: '0x' + cleanS.padStart(64, '0')
      }
    } catch (error) {
      console.error('DER parsing error:', error)
      return null
    }
  }

  extractSignaturesFromBitcoinTx(tx: any): Array<{
    r: string
    s: string
    z: string
  }> {
    const signatures: Array<{ r: string, s: string, z: string }> = []
    
    try {
      if (!tx.inputs) {
        console.log('No inputs found in transaction')
        return signatures
      }
      
      console.log(`Processing ${tx.inputs.length} inputs for tx ${tx.hash}`)
      
      for (const input of tx.inputs) {
        let scriptSig = ''
        
        console.log('Input data:', {
          hasScriptHex: !!input.script_hex,
          hasScript: !!input.script,
          hasWitnessHex: !!input.witness_hex,
          hasWitness: !!input.witness,
          hasScriptSigHex: !!input.script_sig_hex
        })
        
        if (input.script_hex) {
          scriptSig = input.script_hex
          console.log('Using script_hex:', scriptSig.substring(0, 100))
        } else if (input.script) {
          scriptSig = input.script
          console.log('Using script:', scriptSig.substring(0, 100))
        }
        
        if (input.witness_hex) {
          scriptSig = input.witness_hex
          console.log('Using witness_hex:', scriptSig.substring(0, 100))
        }
        
        if (input.witness && Array.isArray(input.witness)) {
          scriptSig = input.witness.join('')
          console.log('Using witness array:', scriptSig.substring(0, 100))
        }
        
        if (input.script_sig_hex) {
          scriptSig = input.script_sig_hex
          console.log('Using script_sig_hex:', scriptSig.substring(0, 100))
        }
        
        if (!scriptSig || scriptSig.length < 100) {
          console.log('Script too short or empty:', scriptSig.length)
          continue
        }
        
        const scriptHex = scriptSig.startsWith('0x') ? scriptSig.slice(2) : scriptSig
        console.log(`Searching for DER signature in ${scriptHex.length} byte script`)
        
        let derSig = ''
        
        for (let offset = 0; offset < Math.min(scriptHex.length - 140, 400); offset += 2) {
          const byte = scriptHex.substring(offset, offset + 2)
          
          if (byte === '30') {
            const lenHex = scriptHex.substring(offset + 2, offset + 4)
            const len = parseInt(lenHex, 16)
            
            if (len >= 68 && len <= 73) {
              derSig = '30' + scriptHex.substring(offset + 2, offset + 4 + len * 2)
              console.log(`Found potential DER signature at offset ${offset}: ${derSig.substring(0, 40)}...`)
              
              const parsed = this.parseDERSignature(derSig)
              if (parsed && parsed.r && parsed.s) {
                const txHash = tx.hash.startsWith('0x') ? tx.hash : '0x' + tx.hash
                
                console.log('Successfully parsed signature:', {
                  r: parsed.r.substring(0, 20),
                  s: parsed.s.substring(0, 20),
                  z: txHash.substring(0, 20)
                })
                
                signatures.push({
                  r: parsed.r,
                  s: parsed.s,
                  z: txHash
                })
                break
              }
            }
          }
          
          const lenValue = parseInt(byte, 16)
          if (lenValue >= 70 && lenValue <= 73) {
            derSig = scriptHex.substring(offset, offset + 2 + lenValue * 2)
            
            const parsed = this.parseDERSignature(derSig)
            if (parsed && parsed.r && parsed.s) {
              const txHash = tx.hash.startsWith('0x') ? tx.hash : '0x' + tx.hash
              
              console.log('Successfully parsed signature (method 2):', {
                r: parsed.r.substring(0, 20),
                s: parsed.s.substring(0, 20),
                z: txHash.substring(0, 20)
              })
              
              signatures.push({
                r: parsed.r,
                s: parsed.s,
                z: txHash
              })
              break
            }
          }
        }
        
        if (!derSig) {
          console.log('No DER signature found in this input')
        }
      }
    } catch (error) {
      console.error('Bitcoin signature extraction error:', error)
    }
    
    return signatures
  }

  extractSignatureFromTransaction(tx: ExplorerTransaction): {
    r: string
    s: string
    v?: string
    z: string
  } | null {
    try {
      if (tx.r && tx.s) {
        const txHash = tx.hash.startsWith('0x') ? tx.hash : '0x' + tx.hash
        return {
          r: tx.r.startsWith('0x') ? tx.r : '0x' + tx.r,
          s: tx.s.startsWith('0x') ? tx.s : '0x' + tx.s,
          v: tx.v,
          z: txHash
        }
      }

      if (tx.input && tx.input.length > 130) {
        const sig = tx.input.slice(-130)
        const r = '0x' + sig.slice(0, 64)
        const s = '0x' + sig.slice(64, 128)
        const v = '0x' + sig.slice(128, 130)
        const txHash = tx.hash.startsWith('0x') ? tx.hash : '0x' + tx.hash
        
        return {
          r,
          s,
          v,
          z: txHash
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

    console.log(`Analyzing ${addressInfo.transactions.length} transactions for address ${address}`)

    for (const tx of addressInfo.transactions) {
      console.log('Processing transaction:', {
        hash: tx.hash,
        hasInputs: !!tx.inputs,
        inputsCount: tx.inputs?.length || 0,
        isBitcoin: chain === 'bitcoin' || chain === 'bitcoin-testnet' || address.match(/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/)
      })

      if (chain === 'bitcoin' || chain === 'bitcoin-testnet' || address.match(/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/)) {
        const btcSigs = this.extractSignaturesFromBitcoinTx(tx)
        console.log(`Extracted ${btcSigs.length} signatures from Bitcoin tx ${tx.hash}`)
        for (const sig of btcSigs) {
          signatures.push({
            r: sig.r,
            s: sig.s,
            z: sig.z,
            txid: tx.hash,
            blockNumber: tx.blockNumber,
            timestamp: tx.timestamp
          })
        }
      } else {
        const sig = this.extractSignatureFromTransaction(tx)
        if (sig) {
          console.log(`Extracted signature from tx ${tx.hash}`)
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
    }

    console.log(`Total signatures extracted: ${signatures.length}`)

    return {
      signatures,
      totalTransactions: addressInfo.totalTransactions,
      signaturesFound: signatures.length
    }
  }
}

export const blockchainExplorer = new BlockchainExplorer()
