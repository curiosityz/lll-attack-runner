/**
 * @deprecated RPC Scanner is deprecated and will be removed in a future version.
 * 
 * REASON FOR DEPRECATION:
 * RPC scanning for signatures is redundant when signature data is already being ingested
 * and stored from blockchain data sources like Blockchair TSV dumps. Additionally:
 * - RPC scanning doesn't work reliably in practice due to CORS issues, rate limits
 * - Most RPC endpoints don't expose the raw signature data (r, s values) needed
 * - File-based ingestion (Blockchair TSV, JSON, CSV) provides complete signature data
 * 
 * USE INSTEAD:
 * - Upload signature data via DataUpload or BlockchairUpload components
 * - Use signatureAnalyzer.ts for analysis of ingested signatures
 * - Use batch-analysis.ts for pattern detection on ParsedSignature arrays
 */

import { fetchJSONWithCORSProxy, corsProxyManager } from './cors-proxy'

export interface RPCSignature {
  r: string
  s: string
  v?: number
  hash: string
  publicKey?: string
  address: string
  blockNumber: number
  transactionHash: string
  timestamp?: number
}

/**
 * @deprecated Use WeakSignature from signatureAnalyzer.ts instead
 */
export interface WeakSignature {
  signature: RPCSignature
  weakness: 'nonce-reuse' | 'low-s' | 'biased-k' | 'similar-k' | 'small-r'
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  relatedSignatures?: RPCSignature[]
}

export interface ScanResult {
  scanned: number
  weakSignatures: WeakSignature[]
  allSignatures: RPCSignature[]
  duration: number
  rpcUrl: string
  blockRange: { from: number; to: number }
}

function hexToBigInt(hex: string): bigint {
  if (hex.startsWith('0x')) {
    hex = hex.slice(2)
  }
  if (hex === '') return 0n
  return BigInt('0x' + hex)
}

function bigIntToHex(value: bigint): string {
  const hexStr = value.toString(16)
  return '0x' + hexStr
}

function modInverse(a: bigint, m: bigint): bigint {
  if (a < 0n) a = ((a % m) + m) % m
  
  let [old_r, r] = [a, m]
  let [old_s, s] = [1n, 0n]
  
  while (r !== 0n) {
    const quotient = old_r / r
    ;[old_r, r] = [r, old_r - quotient * r]
    ;[old_s, s] = [s, old_s - quotient * s]
  }
  
  if (old_r > 1n) {
    throw new Error('Not invertible')
  }
  
  if (old_s < 0n) {
    old_s = old_s + m
  }
  
  return old_s
}

const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
const SECP256K1_HALF_N = SECP256K1_N / 2n

export async function scanRPCForWeakSignatures(
  rpcUrl: string,
  fromBlock: number,
  toBlock: number,
  onProgress?: (current: number, total: number) => void
): Promise<ScanResult> {
  const startTime = performance.now()
  const weakSignatures: WeakSignature[] = []
  const signatureMap = new Map<string, RPCSignature[]>()
  const allSignatures: RPCSignature[] = []
  
  let scannedCount = 0
  const totalBlocks = toBlock - fromBlock + 1
  let consecutiveErrors = 0
  let totalErrors = 0
  let totalTransactions = 0
  
  if (!rpcUrl || rpcUrl.trim() === '') {
    throw new Error('Invalid RPC URL. Please provide a valid Ethereum RPC endpoint.')
  }
  
  if (rpcUrl.includes('YOUR_API_KEY') || rpcUrl.includes('YOUR_PROJECT_ID')) {
    throw new Error('Please replace YOUR_API_KEY or YOUR_PROJECT_ID with your actual credentials.')
  }
  
  if (fromBlock < 0 || toBlock < 0) {
    throw new Error('Block numbers must be positive integers')
  }
  
  if (fromBlock > toBlock) {
    throw new Error('From block must be less than or equal to to block')
  }
  
  console.log(`Starting scan: blocks ${fromBlock}-${toBlock} (${totalBlocks} blocks) on ${rpcUrl}`)
  console.log(`First block hex test: ${fromBlock} => ${bigIntToHex(BigInt(fromBlock))}`)
  console.log(`Last block hex test: ${toBlock} => ${bigIntToHex(BigInt(toBlock))}`)
  
  try {
    const testBlock = await fetchJSONWithCORSProxy(rpcUrl, {
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
      id: 1
    })
    const latestBlock = parseInt(testBlock.result, 16)
    console.log('RPC connection successful, latest block:', latestBlock)
    
    if (fromBlock > latestBlock) {
      throw new Error(`Start block ${fromBlock} is beyond the latest block ${latestBlock}`)
    }
  } catch (error) {
    throw new Error(`Failed to connect to RPC endpoint: ${error instanceof Error ? error.message : 'Unknown error'}. Please verify the URL and your network connection.`)
  }
  
  for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
    try {
      const blockHex = bigIntToHex(BigInt(blockNum))
      
      if (blockNum === fromBlock || blockNum === toBlock || blockNum % 100 === 0) {
        console.log(`[RPC] Block ${blockNum} => Hex: ${blockHex} (length: ${blockHex.length})`)
      }
      
      const blockData = await fetchJSONWithCORSProxy(rpcUrl, {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: [blockHex, true],
        id: blockNum
      })
      
      const block = blockData.result
      if (!block) {
        console.warn(`Block ${blockNum} returned null - may not exist yet`)
        scannedCount++
        if (onProgress) {
          onProgress(scannedCount, totalBlocks)
        }
        continue
      }
      
      if (!block.transactions || !Array.isArray(block.transactions)) {
        console.warn(`Block ${blockNum} has no transactions array`)
        scannedCount++
        if (onProgress) {
          onProgress(scannedCount, totalBlocks)
        }
        continue
      }
      
      let blockTxCount = 0
      
      for (const tx of block.transactions) {
        if (typeof tx === 'string') {
          continue
        }
        
        if (!tx.r || !tx.s || !tx.v) continue
        
        blockTxCount++
        totalTransactions++
        
        const signature: RPCSignature = {
          r: tx.r,
          s: tx.s,
          v: typeof tx.v === 'string' ? parseInt(tx.v, 16) : tx.v,
          hash: tx.hash,
          address: tx.from || '',
          blockNumber: blockNum,
          transactionHash: tx.hash,
          timestamp: block.timestamp ? (typeof block.timestamp === 'string' ? parseInt(block.timestamp, 16) : block.timestamp) : undefined
        }
        
        allSignatures.push(signature)
        
        const r = hexToBigInt(signature.r)
        const s = hexToBigInt(signature.s)
        
        if (r < 1000n) {
          weakSignatures.push({
            signature,
            weakness: 'small-r',
            severity: 'critical',
            description: `Extremely small r value: ${r}. This indicates a critical weakness.`
          })
        }
        
        if (s > SECP256K1_HALF_N) {
          weakSignatures.push({
            signature,
            weakness: 'low-s',
            severity: 'low',
            description: `High s-value (non-canonical signature). Should normalize to low-s form.`
          })
        }
        
        const rHex = signature.r
        if (!signatureMap.has(rHex)) {
          signatureMap.set(rHex, [])
        }
        signatureMap.get(rHex)!.push(signature)
      }
      
      if (blockNum % 10 === 0 || blockNum === toBlock) {
        console.log(`Scanned block ${blockNum}: ${blockTxCount} transactions (${totalTransactions} total so far)`)
      }
      
      consecutiveErrors = 0
      scannedCount++
      if (onProgress) {
        onProgress(scannedCount, totalBlocks)
      }
      
      if (blockNum < toBlock) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
    } catch (error) {
      consecutiveErrors++
      totalErrors++
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`Failed to process block ${blockNum}:`, errorMsg)
      
      if (consecutiveErrors >= 10) {
        throw new Error(`Too many consecutive errors (${consecutiveErrors}). Last error: ${errorMsg}. Please check your RPC endpoint or try a different one.`)
      }
      
      if (totalErrors > Math.max(10, totalBlocks / 2)) {
        throw new Error(`More than 50% of blocks failed to scan (${totalErrors}/${totalBlocks}). Please verify your RPC endpoint is working correctly.`)
      }
      
      const backoffDelay = Math.min(1000, 100 * Math.pow(2, consecutiveErrors - 1))
      await new Promise(resolve => setTimeout(resolve, backoffDelay))
      
      scannedCount++
      if (onProgress) {
        onProgress(scannedCount, totalBlocks)
      }
    }
  }
  
  console.log(`Scan complete: ${totalTransactions} transactions analyzed across ${scannedCount} blocks`)
  
  for (const [rValue, signatures] of signatureMap.entries()) {
    if (signatures.length > 1) {
      const mainSig = signatures[0]
      weakSignatures.push({
        signature: mainSig,
        weakness: 'nonce-reuse',
        severity: 'critical',
        description: `Nonce (k) reused ${signatures.length} times! Private key can be recovered.`,
        relatedSignatures: signatures.slice(1)
      })
    }
  }
  
  for (let i = 0; i < allSignatures.length; i++) {
    const sig1 = allSignatures[i]
    const r1 = hexToBigInt(sig1.r)
    
    for (let j = i + 1; j < Math.min(i + 20, allSignatures.length); j++) {
      const sig2 = allSignatures[j]
      const r2 = hexToBigInt(sig2.r)
      
      if (sig1.address === sig2.address && r1 !== r2) {
        const diff = r1 > r2 ? r1 - r2 : r2 - r1
        
        if (diff < 1000000n) {
          const existing = weakSignatures.find(w => 
            w.signature.transactionHash === sig1.transactionHash && 
            w.weakness === 'similar-k'
          )
          
          if (!existing) {
            weakSignatures.push({
              signature: sig1,
              weakness: 'similar-k',
              severity: 'high',
              description: `Similar nonce values detected (difference: ${diff}). May indicate biased RNG.`,
              relatedSignatures: [sig2]
            })
          }
        }
      }
    }
  }
  
  const endTime = performance.now()
  
  return {
    scanned: scannedCount,
    weakSignatures,
    allSignatures,
    duration: Math.round(endTime - startTime),
    rpcUrl,
    blockRange: { from: fromBlock, to: toBlock }
  }
}

export function recoverPrivateKeyFromNonceReuse(
  sig1: RPCSignature,
  sig2: RPCSignature
): bigint | null {
  try {
    const r1 = hexToBigInt(sig1.r)
    const s1 = hexToBigInt(sig1.s)
    const z1 = hexToBigInt(sig1.hash)
    
    const r2 = hexToBigInt(sig2.r)
    const s2 = hexToBigInt(sig2.s)
    const z2 = hexToBigInt(sig2.hash)
    
    if (r1 !== r2) {
      return null
    }
    
    const sDiff = (s1 - s2 + SECP256K1_N) % SECP256K1_N
    const zDiff = (z1 - z2 + SECP256K1_N) % SECP256K1_N
    
    if (sDiff === 0n) {
      return null
    }
    
    const k = (zDiff * modInverse(sDiff, SECP256K1_N)) % SECP256K1_N
    
    const privateKey = ((s1 * k - z1) * modInverse(r1, SECP256K1_N)) % SECP256K1_N
    
    return privateKey
  } catch (error) {
    console.error('Failed to recover private key:', error)
    return null
  }
}

export function generateLatticeFromWeakSignatures(
  weakSig: WeakSignature
): { basis: number[][]; delta: number; description: string } | null {
  if (weakSig.weakness === 'nonce-reuse' && weakSig.relatedSignatures && weakSig.relatedSignatures.length > 0) {
    const sig1 = weakSig.signature
    const sig2 = weakSig.relatedSignatures[0]
    
    const privateKey = recoverPrivateKeyFromNonceReuse(sig1, sig2)
    
    if (privateKey) {
      const r = hexToBigInt(sig1.r)
      const s = hexToBigInt(sig1.s)
      
      const rNum = Number(r % 1000000n)
      const sNum = Number(s % 1000000n)
      
      return {
        basis: [
          [1, 0, rNum],
          [0, 1, sNum],
          [0, 0, 1000000]
        ],
        delta: 0.99,
        description: `Nonce reuse attack: Private key can be directly computed. Lattice confirms weakness structure.`
      }
    }
  }
  
  if (weakSig.weakness === 'biased-k' || weakSig.weakness === 'similar-k') {
    const signatures = [weakSig.signature, ...(weakSig.relatedSignatures || [])]
    
    if (signatures.length >= 2) {
      const basis: number[][] = []
      const scale = 1000
      
      for (let i = 0; i < Math.min(signatures.length, 5); i++) {
        const r = hexToBigInt(signatures[i].r)
        const s = hexToBigInt(signatures[i].s)
        
        const row = new Array(signatures.length + 1).fill(0)
        row[i] = scale
        row[signatures.length] = Number((r * s) % 100000n)
        
        basis.push(row)
      }
      
      const lastRow = new Array(signatures.length + 1).fill(0)
      lastRow[signatures.length] = 100000
      basis.push(lastRow)
      
      return {
        basis,
        delta: 0.99,
        description: `Hidden Number Problem (HNP) lattice for biased nonces. ${signatures.length} signatures with bias.`
      }
    }
  }
  
  if (weakSig.weakness === 'small-r') {
    const r = hexToBigInt(weakSig.signature.r)
    const s = hexToBigInt(weakSig.signature.s)
    
    const rNum = Number(r)
    const sNum = Number(s % 1000000n)
    
    return {
      basis: [
        [1, 0, rNum],
        [0, 1, sNum],
        [0, 0, 10000]
      ],
      delta: 0.99,
      description: `Small r-value attack: r=${rNum}. Lattice reduction may reveal private key structure.`
    }
  }
  
  return null
}
