import { ParsedSignature } from './dataParser'

/**
 * Signature type for batch analysis - uses bigint for r/s values
 * This is an alias for ParsedSignature to maintain compatibility
 */
export type AnalysisSignature = ParsedSignature

/**
 * Legacy RPCSignature type for backward compatibility with string-based r/s values
 * @deprecated Use ParsedSignature (AnalysisSignature) instead - r/s should be bigint
 */
export interface LegacyRPCSignature {
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
 * Convert a hex string to bigint
 */
function hexToBigInt(hex: string): bigint {
  if (!hex) return 0n
  if (hex.startsWith('0x')) {
    hex = hex.slice(2)
  }
  if (hex === '') return 0n
  return BigInt('0x' + hex)
}

/**
 * Convert a legacy RPC signature (string r/s) to ParsedSignature (bigint r/s)
 */
export function convertLegacySignature(sig: LegacyRPCSignature): ParsedSignature {
  return {
    r: hexToBigInt(sig.r),
    s: hexToBigInt(sig.s),
    v: sig.v || 0,
    hash: sig.hash || sig.transactionHash,
    address: sig.address,
    blockNumber: sig.blockNumber,
    timestamp: sig.timestamp
  }
}

/**
 * Convert an array of legacy signatures to ParsedSignature format
 */
export function convertLegacySignatures(sigs: LegacyRPCSignature[]): ParsedSignature[] {
  return sigs.map(convertLegacySignature)
}

export interface SignatureCluster {
  id: string
  signatures: ParsedSignature[]
  pattern: 'nonce-reuse' | 'sequential-nonce' | 'biased-lsb' | 'biased-msb' | 'temporal-correlation' | 'address-clustering'
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  confidence: number
  addressCount: number
  timeSpan?: number
  metadata: Record<string, any>
}

export interface BatchAnalysisResult {
  totalSignatures: number
  uniqueAddresses: number
  clusters: SignatureCluster[]
  statisticalPatterns: StatisticalPattern[]
  recommendations: string[]
  analysisTime: number
}

export interface StatisticalPattern {
  type: 'bit-bias' | 'entropy-reduction' | 'periodic-pattern' | 'value-correlation'
  description: string
  affectedSignatures: number
  statisticalSignificance: number
  details: Record<string, any>
}

function calculateEntropy(values: bigint[]): number {
  if (values.length === 0) return 0
  
  const freqMap = new Map<string, number>()
  for (const val of values) {
    const bucket = (val % 256n).toString()
    freqMap.set(bucket, (freqMap.get(bucket) || 0) + 1)
  }
  
  let entropy = 0
  const total = values.length
  for (const count of freqMap.values()) {
    const p = count / total
    entropy -= p * Math.log2(p)
  }
  
  return entropy / Math.log2(256)
}

function detectBitBias(values: bigint[]): { biased: boolean; bias: number; position: string } {
  if (values.length < 10) return { biased: false, bias: 0, position: 'none' }
  
  let lsbZeroCount = 0
  let msbZeroCount = 0
  
  for (const val of values) {
    if ((val & 0xFFn) < 0x80n) lsbZeroCount++
    
    const str = val.toString(2)
    if (str.length > 0 && str.length < 252) msbZeroCount++
  }
  
  const lsbBias = Math.abs(lsbZeroCount / values.length - 0.5)
  const msbBias = Math.abs(msbZeroCount / values.length - 0.5)
  
  if (lsbBias > 0.2) {
    return { biased: true, bias: lsbBias, position: 'lsb' }
  } else if (msbBias > 0.2) {
    return { biased: true, bias: msbBias, position: 'msb' }
  }
  
  return { biased: false, bias: 0, position: 'none' }
}

function detectSequentialNonces(signatures: ParsedSignature[]): SignatureCluster[] {
  const clusters: SignatureCluster[] = []
  const addressGroups = new Map<string, ParsedSignature[]>()
  
  for (const sig of signatures) {
    if (!addressGroups.has(sig.address)) {
      addressGroups.set(sig.address, [])
    }
    addressGroups.get(sig.address)!.push(sig)
  }
  
  for (const [address, sigs] of addressGroups.entries()) {
    if (sigs.length < 3) continue
    
    const sorted = [...sigs].sort((a, b) => {
      const blockDiff = (a.blockNumber || 0) - (b.blockNumber || 0)
      if (blockDiff !== 0) return blockDiff
      return a.hash.localeCompare(b.hash)
    })
    
    // r is already bigint in ParsedSignature
    const rValues = sorted.map(s => s.r)
    let sequentialCount = 0
    
    for (let i = 0; i < rValues.length - 1; i++) {
      const diff = rValues[i + 1] > rValues[i] 
        ? rValues[i + 1] - rValues[i] 
        : rValues[i] - rValues[i + 1]
      
      if (diff < 1000000n) {
        sequentialCount++
      }
    }
    
    const sequentialRatio = sequentialCount / (rValues.length - 1)
    
    if (sequentialRatio > 0.5 && rValues.length >= 3) {
      clusters.push({
        id: `seq-${address.slice(0, 10)}`,
        signatures: sorted,
        pattern: 'sequential-nonce',
        severity: 'high',
        description: `Sequential nonce pattern detected: ${sequentialCount} consecutive similar r-values`,
        confidence: sequentialRatio,
        addressCount: 1,
        metadata: {
          address,
          sequentialCount,
          totalCount: rValues.length,
          averageDifference: '< 1,000,000'
        }
      })
    }
  }
  
  return clusters
}

function detectNonceReuseClusters(signatures: ParsedSignature[]): SignatureCluster[] {
  const clusters: SignatureCluster[] = []
  // Use string representation of bigint r for mapping
  const rValueMap = new Map<string, ParsedSignature[]>()
  
  for (const sig of signatures) {
    const rStr = sig.r.toString()
    if (!rValueMap.has(rStr)) {
      rValueMap.set(rStr, [])
    }
    rValueMap.get(rStr)!.push(sig)
  }
  
  for (const [rValue, sigs] of rValueMap.entries()) {
    if (sigs.length > 1) {
      const uniqueAddresses = new Set(sigs.map(s => s.address)).size
      const timestamps = sigs.map(s => s.timestamp || 0).filter(t => t > 0)
      const timeSpan = timestamps.length > 1 
        ? Math.max(...timestamps) - Math.min(...timestamps)
        : 0
      
      clusters.push({
        id: `reuse-${rValue.slice(0, 10)}`,
        signatures: sigs,
        pattern: 'nonce-reuse',
        severity: 'critical',
        description: `Nonce reused ${sigs.length} times across ${uniqueAddresses} address(es). Private key recovery possible.`,
        confidence: 1.0,
        addressCount: uniqueAddresses,
        timeSpan,
        metadata: {
          rValue,
          reuseCount: sigs.length,
          addresses: Array.from(new Set(sigs.map(s => s.address)))
        }
      })
    }
  }
  
  return clusters
}

function detectBiasedLSB(signatures: ParsedSignature[]): SignatureCluster[] {
  const clusters: SignatureCluster[] = []
  const addressGroups = new Map<string, ParsedSignature[]>()
  
  for (const sig of signatures) {
    if (!addressGroups.has(sig.address)) {
      addressGroups.set(sig.address, [])
    }
    addressGroups.get(sig.address)!.push(sig)
  }
  
  for (const [address, sigs] of addressGroups.entries()) {
    if (sigs.length < 5) continue
    
    // r is already bigint in ParsedSignature
    const rValues = sigs.map(s => s.r)
    const bias = detectBitBias(rValues)
    
    if (bias.biased && bias.position === 'lsb') {
      clusters.push({
        id: `lsb-${address.slice(0, 10)}`,
        signatures: sigs,
        pattern: 'biased-lsb',
        severity: 'high',
        description: `Least significant bit bias detected: ${(bias.bias * 100).toFixed(1)}% deviation from expected randomness`,
        confidence: bias.bias * 2,
        addressCount: 1,
        metadata: {
          address,
          bias: bias.bias,
          sampleSize: sigs.length
        }
      })
    }
  }
  
  return clusters
}

function detectBiasedMSB(signatures: ParsedSignature[]): SignatureCluster[] {
  const clusters: SignatureCluster[] = []
  const addressGroups = new Map<string, ParsedSignature[]>()
  
  for (const sig of signatures) {
    if (!addressGroups.has(sig.address)) {
      addressGroups.set(sig.address, [])
    }
    addressGroups.get(sig.address)!.push(sig)
  }
  
  for (const [address, sigs] of addressGroups.entries()) {
    if (sigs.length < 5) continue
    
    // r is already bigint in ParsedSignature
    const rValues = sigs.map(s => s.r)
    const bias = detectBitBias(rValues)
    
    if (bias.biased && bias.position === 'msb') {
      clusters.push({
        id: `msb-${address.slice(0, 10)}`,
        signatures: sigs,
        pattern: 'biased-msb',
        severity: 'medium',
        description: `Most significant bit bias detected: ${(bias.bias * 100).toFixed(1)}% deviation from expected`,
        confidence: bias.bias * 2,
        addressCount: 1,
        metadata: {
          address,
          bias: bias.bias,
          sampleSize: sigs.length
        }
      })
    }
  }
  
  return clusters
}

function detectTemporalCorrelation(signatures: ParsedSignature[]): SignatureCluster[] {
  const clusters: SignatureCluster[] = []
  const sigsWithTime = signatures.filter(s => s.timestamp && s.timestamp > 0)
  
  if (sigsWithTime.length < 10) return clusters
  
  const addressGroups = new Map<string, ParsedSignature[]>()
  for (const sig of sigsWithTime) {
    if (!addressGroups.has(sig.address)) {
      addressGroups.set(sig.address, [])
    }
    addressGroups.get(sig.address)!.push(sig)
  }
  
  for (const [address, sigs] of addressGroups.entries()) {
    if (sigs.length < 5) continue
    
    const sorted = [...sigs].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    // r is already bigint in ParsedSignature
    const rValues = sorted.map(s => s.r)
    
    let correlationCount = 0
    for (let i = 0; i < rValues.length - 1; i++) {
      const rDiff = rValues[i + 1] > rValues[i] 
        ? Number((rValues[i + 1] - rValues[i]) / 1000000n)
        : Number((rValues[i] - rValues[i + 1]) / 1000000n)
      
      const timeDiff = (sorted[i + 1].timestamp || 0) - (sorted[i].timestamp || 0)
      
      if (timeDiff > 0 && rDiff < 1000 && rDiff > 0) {
        correlationCount++
      }
    }
    
    const correlationRatio = correlationCount / (rValues.length - 1)
    
    if (correlationRatio > 0.4) {
      clusters.push({
        id: `temp-${address.slice(0, 10)}`,
        signatures: sorted,
        pattern: 'temporal-correlation',
        severity: 'medium',
        description: `Temporal correlation detected: nonces appear to correlate with time`,
        confidence: correlationRatio,
        addressCount: 1,
        timeSpan: (sorted[sorted.length - 1].timestamp || 0) - (sorted[0].timestamp || 0),
        metadata: {
          address,
          correlationRatio,
          sampleSize: sigs.length
        }
      })
    }
  }
  
  return clusters
}

function detectAddressClustering(signatures: ParsedSignature[]): SignatureCluster[] {
  const clusters: SignatureCluster[] = []
  const addressMap = new Map<string, ParsedSignature[]>()
  
  for (const sig of signatures) {
    if (!addressMap.has(sig.address)) {
      addressMap.set(sig.address, [])
    }
    addressMap.get(sig.address)!.push(sig)
  }
  
  const highActivityAddresses = Array.from(addressMap.entries())
    .filter(([_, sigs]) => sigs.length >= 5)
    .sort((a, b) => b[1].length - a[1].length)
  
  for (const [address, sigs] of highActivityAddresses) {
    // r is already bigint in ParsedSignature
    const rValues = sigs.map(s => s.r)
    const entropy = calculateEntropy(rValues)
    
    if (entropy < 0.7) {
      clusters.push({
        id: `cluster-${address.slice(0, 10)}`,
        signatures: sigs,
        pattern: 'address-clustering',
        severity: 'medium',
        description: `High activity address with low entropy signatures: ${sigs.length} transactions, entropy ${entropy.toFixed(3)}`,
        confidence: 1 - entropy,
        addressCount: 1,
        metadata: {
          address,
          transactionCount: sigs.length,
          entropy,
          entropyThreshold: 0.7
        }
      })
    }
  }
  
  return clusters
}

function analyzeStatisticalPatterns(signatures: ParsedSignature[]): StatisticalPattern[] {
  const patterns: StatisticalPattern[] = []
  
  if (signatures.length < 10) return patterns
  
  // r and s are already bigint in ParsedSignature
  const rValues = signatures.map(s => s.r)
  const sValues = signatures.map(s => s.s)
  
  const rEntropy = calculateEntropy(rValues)
  if (rEntropy < 0.8) {
    patterns.push({
      type: 'entropy-reduction',
      description: `R-values show reduced entropy: ${(rEntropy * 100).toFixed(1)}% of expected`,
      affectedSignatures: signatures.length,
      statisticalSignificance: 1 - rEntropy,
      details: {
        entropy: rEntropy,
        expectedEntropy: 1.0,
        valueType: 'r'
      }
    })
  }
  
  const sEntropy = calculateEntropy(sValues)
  if (sEntropy < 0.8) {
    patterns.push({
      type: 'entropy-reduction',
      description: `S-values show reduced entropy: ${(sEntropy * 100).toFixed(1)}% of expected`,
      affectedSignatures: signatures.length,
      statisticalSignificance: 1 - sEntropy,
      details: {
        entropy: sEntropy,
        expectedEntropy: 1.0,
        valueType: 's'
      }
    })
  }
  
  const rBias = detectBitBias(rValues)
  if (rBias.biased) {
    patterns.push({
      type: 'bit-bias',
      description: `Bit bias in r-values: ${rBias.position.toUpperCase()} shows ${(rBias.bias * 100).toFixed(1)}% deviation`,
      affectedSignatures: signatures.length,
      statisticalSignificance: rBias.bias,
      details: {
        position: rBias.position,
        bias: rBias.bias,
        valueType: 'r'
      }
    })
  }
  
  if (signatures.length >= 20) {
    const addressFreq = new Map<string, number>()
    for (const sig of signatures) {
      addressFreq.set(sig.address, (addressFreq.get(sig.address) || 0) + 1)
    }
    
    const correlations: Array<{ addr1: string; addr2: string; correlation: number }> = []
    const addresses = Array.from(addressFreq.keys()).filter(addr => (addressFreq.get(addr) || 0) >= 3)
    
    for (let i = 0; i < addresses.length; i++) {
      for (let j = i + 1; j < addresses.length; j++) {
        const sigs1 = signatures.filter(s => s.address === addresses[i])
        const sigs2 = signatures.filter(s => s.address === addresses[j])
        
        // r is already bigint in ParsedSignature
        const r1 = sigs1.map(s => s.r)
        const r2 = sigs2.map(s => s.r)
        
        let similarCount = 0
        for (const v1 of r1) {
          for (const v2 of r2) {
            const diff = v1 > v2 ? v1 - v2 : v2 - v1
            if (diff < 1000000n) {
              similarCount++
            }
          }
        }
        
        const correlation = similarCount / Math.sqrt(r1.length * r2.length)
        if (correlation > 0.3) {
          correlations.push({ addr1: addresses[i], addr2: addresses[j], correlation })
        }
      }
    }
    
    if (correlations.length > 0) {
      patterns.push({
        type: 'value-correlation',
        description: `Cross-address correlation detected: ${correlations.length} address pair(s) show similar r-values`,
        affectedSignatures: signatures.length,
        statisticalSignificance: Math.max(...correlations.map(c => c.correlation)),
        details: {
          correlationPairs: correlations.length,
          topCorrelations: correlations.slice(0, 3)
        }
      })
    }
  }
  
  return patterns
}

function generateRecommendations(
  clusters: SignatureCluster[],
  patterns: StatisticalPattern[]
): string[] {
  const recommendations: string[] = []
  
  const criticalClusters = clusters.filter(c => c.severity === 'critical')
  const highClusters = clusters.filter(c => c.severity === 'high')
  
  if (criticalClusters.length > 0) {
    recommendations.push(`CRITICAL: ${criticalClusters.length} critical vulnerability pattern(s) detected. Immediate action required.`)
    
    const nonceReuse = criticalClusters.filter(c => c.pattern === 'nonce-reuse')
    if (nonceReuse.length > 0) {
      recommendations.push(`Use nonce reuse attack to directly recover private keys from ${nonceReuse.length} cluster(s).`)
    }
  }
  
  if (highClusters.length > 0) {
    recommendations.push(`HIGH: ${highClusters.length} high-severity pattern(s) found. Use HNP lattice attack.`)
    
    const biasedPatterns = highClusters.filter(c => 
      c.pattern === 'biased-lsb' || c.pattern === 'biased-msb' || c.pattern === 'sequential-nonce'
    )
    if (biasedPatterns.length > 0) {
      recommendations.push(`Construct Hidden Number Problem lattice using ${biasedPatterns.length} biased pattern(s).`)
    }
  }
  
  const entropyPatterns = patterns.filter(p => p.type === 'entropy-reduction')
  if (entropyPatterns.length > 0) {
    recommendations.push(`Reduced entropy detected in ${entropyPatterns.length} value type(s). Consider larger sample size for better attack success.`)
  }
  
  const correlationPatterns = patterns.filter(p => p.type === 'value-correlation')
  if (correlationPatterns.length > 0) {
    recommendations.push(`Cross-address correlations suggest shared RNG or related keys. Investigate address relationships.`)
  }
  
  if (recommendations.length === 0) {
    recommendations.push('No significant patterns detected. Increase scan range or try different block ranges.')
    recommendations.push('Consider scanning addresses with high transaction activity.')
  } else {
    recommendations.push(`Run BKZ with block size 15-20 for strongest reduction on complex patterns.`)
  }
  
  return recommendations
}

export function performBatchAnalysis(signatures: ParsedSignature[]): BatchAnalysisResult {
  const startTime = performance.now()
  
  const clusters: SignatureCluster[] = []
  
  clusters.push(...detectNonceReuseClusters(signatures))
  clusters.push(...detectSequentialNonces(signatures))
  clusters.push(...detectBiasedLSB(signatures))
  clusters.push(...detectBiasedMSB(signatures))
  clusters.push(...detectTemporalCorrelation(signatures))
  clusters.push(...detectAddressClustering(signatures))
  
  const statisticalPatterns = analyzeStatisticalPatterns(signatures)
  
  const recommendations = generateRecommendations(clusters, statisticalPatterns)
  
  const uniqueAddresses = new Set(signatures.map(s => s.address)).size
  
  const endTime = performance.now()
  
  return {
    totalSignatures: signatures.length,
    uniqueAddresses,
    clusters,
    statisticalPatterns,
    recommendations,
    analysisTime: endTime - startTime
  }
}

export function generateBatchAttackConfiguration(
  cluster: SignatureCluster
): { basis: number[][]; delta: number; description: string; algorithm: 'lll' | 'bkz'; blockSize?: number } | null {
  if (cluster.pattern === 'nonce-reuse') {
    const sig1 = cluster.signatures[0]
    const sig2 = cluster.signatures[1]
    
    // r and s are already bigint in ParsedSignature
    const r = sig1.r
    const s1 = sig1.s
    const s2 = sig2.s
    
    const rNum = Number(r % 1000000n)
    const s1Num = Number(s1 % 1000000n)
    const s2Num = Number(s2 % 1000000n)
    
    return {
      basis: [
        [1, 0, 0, rNum],
        [0, 1, 0, s1Num],
        [0, 0, 1, s2Num],
        [0, 0, 0, 1000000]
      ],
      delta: 0.99,
      description: `Nonce reuse attack on ${cluster.signatures.length} signatures. Private key directly recoverable.`,
      algorithm: 'lll'
    }
  }
  
  if (cluster.pattern === 'sequential-nonce' || cluster.pattern === 'biased-lsb' || cluster.pattern === 'biased-msb') {
    const n = Math.min(cluster.signatures.length, 8)
    const basis: number[][] = []
    
    for (let i = 0; i < n; i++) {
      // r and s are already bigint in ParsedSignature
      const r = cluster.signatures[i].r
      const s = cluster.signatures[i].s
      
      const row = new Array(n + 2).fill(0)
      row[i] = 10000
      row[n] = Number((r % 100000n))
      row[n + 1] = Number((s % 100000n))
      
      basis.push(row)
    }
    
    const targetRow = new Array(n + 2).fill(0)
    targetRow[n] = 100000
    basis.push(targetRow)
    
    const normRow = new Array(n + 2).fill(0)
    normRow[n + 1] = 100000
    basis.push(normRow)
    
    return {
      basis,
      delta: 0.99,
      description: `HNP lattice attack on ${cluster.pattern} pattern with ${n} signatures.`,
      algorithm: 'bkz',
      blockSize: Math.min(15, Math.max(10, Math.floor(n / 2)))
    }
  }
  
  if (cluster.pattern === 'temporal-correlation' || cluster.pattern === 'address-clustering') {
    const n = Math.min(cluster.signatures.length, 6)
    const basis: number[][] = []
    const scale = 1000
    
    for (let i = 0; i < n; i++) {
      // r and s are already bigint in ParsedSignature
      const r = cluster.signatures[i].r
      const s = cluster.signatures[i].s
      
      const row = new Array(n + 1).fill(0)
      row[i] = scale
      row[n] = Number((r * s) % 50000n)
      
      basis.push(row)
    }
    
    const lastRow = new Array(n + 1).fill(0)
    lastRow[n] = 50000
    basis.push(lastRow)
    
    return {
      basis,
      delta: 0.99,
      description: `Correlation-based attack on ${cluster.pattern} with ${n} samples.`,
      algorithm: 'bkz',
      blockSize: 12
    }
  }
  
  return null
}
