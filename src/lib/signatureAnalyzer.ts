import { ParsedSignature } from './dataParser'

export interface WeakSignature {
  signature: ParsedSignature
  weakness: 'nonce-reuse' | 'low-s' | 'biased-k' | 'similar-k' | 'small-r' | 'sequential-k'
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  relatedSignatures?: ParsedSignature[]
  metadata?: Record<string, any>
}

export interface AnalysisResult {
  totalAnalyzed: number
  weakSignatures: WeakSignature[]
  patterns: PatternCluster[]
  statistics: SignatureStatistics
}

export interface PatternCluster {
  type: 'nonce-reuse' | 'sequential' | 'biased-lsb' | 'biased-msb' | 'temporal' | 'address-clustering'
  signatures: ParsedSignature[]
  confidence: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  metadata: Record<string, any>
}

export interface SignatureStatistics {
  totalSignatures: number
  uniqueAddresses: number
  rValueDistribution: { min: bigint; max: bigint; mean: number }
  sValueDistribution: { min: bigint; max: bigint; mean: number }
  bitBias: { lsb: number; msb: number }
  addressFrequency: Map<string, number>
}

const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
const SECP256K1_HALF_N = SECP256K1_N / 2n

function calculateBitBias(values: bigint[]): { lsb: number; msb: number } {
  if (values.length === 0) return { lsb: 0, msb: 0 }
  
  let lsbOnes = 0
  let msbOnes = 0
  
  for (const value of values) {
    if ((value & 1n) === 1n) lsbOnes++
    
    const bitLength = value.toString(2).length
    if (bitLength > 0 && value.toString(2)[0] === '1') {
      msbOnes++
    }
  }
  
  const expectedRatio = 0.5
  const lsbRatio = lsbOnes / values.length
  const msbRatio = msbOnes / values.length
  
  return {
    lsb: Math.abs(lsbRatio - expectedRatio) / expectedRatio,
    msb: Math.abs(msbRatio - expectedRatio) / expectedRatio
  }
}

function calculateStatistics(signatures: ParsedSignature[]): SignatureStatistics {
  const addressFrequency = new Map<string, number>()
  const rValues: bigint[] = []
  const sValues: bigint[] = []
  
  for (const sig of signatures) {
    rValues.push(sig.r)
    sValues.push(sig.s)
    addressFrequency.set(sig.address, (addressFrequency.get(sig.address) || 0) + 1)
  }
  
  const rMin = rValues.reduce((min, r) => r < min ? r : min, rValues[0] || 0n)
  const rMax = rValues.reduce((max, r) => r > max ? r : max, rValues[0] || 0n)
  const sMin = sValues.reduce((min, s) => s < min ? s : min, sValues[0] || 0n)
  const sMax = sValues.reduce((max, s) => s > max ? s : max, sValues[0] || 0n)
  
  const rMean = rValues.reduce((sum, r) => sum + Number(r / 1000000000000n), 0) / rValues.length
  const sMean = sValues.reduce((sum, s) => sum + Number(s / 1000000000000n), 0) / sValues.length
  
  const bitBias = calculateBitBias(rValues)
  
  return {
    totalSignatures: signatures.length,
    uniqueAddresses: addressFrequency.size,
    rValueDistribution: { min: rMin, max: rMax, mean: rMean },
    sValueDistribution: { min: sMin, max: sMax, mean: sMean },
    bitBias,
    addressFrequency
  }
}

function detectNonceReuse(signatures: ParsedSignature[]): WeakSignature[] {
  const weaknesses: WeakSignature[] = []
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
      for (const sig of sigs) {
        weaknesses.push({
          signature: sig,
          weakness: 'nonce-reuse',
          severity: 'critical',
          description: `Nonce reuse detected! This signature reuses r-value ${rValue.slice(0, 20)}... with ${sigs.length - 1} other signature(s). Private key is directly recoverable.`,
          relatedSignatures: sigs.filter(s => s !== sig),
          metadata: { reuseCount: sigs.length }
        })
      }
    }
  }
  
  return weaknesses
}

function detectBiasedNonces(signatures: ParsedSignature[]): WeakSignature[] {
  const weaknesses: WeakSignature[] = []
  const biasedSigs: ParsedSignature[] = []
  
  for (const sig of signatures) {
    const rBits = sig.r.toString(2)
    const sBits = sig.s.toString(2)
    
    const expectedBits = 256
    const rBitLength = rBits.length
    const sBitLength = sBits.length
    
    let isBiased = false
    let biasDescription = ''
    let biasMetadata: any = { bitLength: rBitLength, expectedBits }
    
    if (rBitLength < expectedBits * 0.9) {
      isBiased = true
      biasDescription = `Biased nonce detected: r-value has only ${rBitLength} bits (expected ~${expectedBits}). This suggests weak random number generation.`
      biasMetadata.biasType = 'short-bits'
    }
    
    const leadingZeros = rBits.split('').findIndex(bit => bit === '1')
    if (leadingZeros > 10) {
      isBiased = true
      biasDescription = `Nonce bias detected: r-value has ${leadingZeros} leading zero bits. This indicates a pattern that may be exploitable via HNP lattice attack.`
      biasMetadata.leadingZeros = leadingZeros
      biasMetadata.biasType = 'leading-zeros'
    }
    
    if (isBiased) {
      biasedSigs.push(sig)
    }
  }
  
  for (let i = 0; i < biasedSigs.length; i++) {
    const sig = biasedSigs[i]
    const rBits = sig.r.toString(2)
    const leadingZeros = rBits.split('').findIndex(bit => bit === '1')
    const rBitLength = rBits.length
    
    const relatedBiased = biasedSigs.filter((s, idx) => {
      if (idx === i) return false
      const sBits = s.r.toString(2)
      const sLeadingZeros = sBits.split('').findIndex(bit => bit === '1')
      const sBitLength = sBits.length
      
      return Math.abs(sBitLength - rBitLength) < 20 || Math.abs(sLeadingZeros - leadingZeros) < 5
    })
    
    const severity = relatedBiased.length >= 10 ? 'critical' : (relatedBiased.length >= 5 ? 'high' : 'high')
    
    weaknesses.push({
      signature: sig,
      weakness: 'biased-k',
      severity,
      description: `Biased nonce detected: r-value has ${rBitLength} bits with ${leadingZeros} leading zeros. ${relatedBiased.length > 0 ? `Found ${relatedBiased.length} similar biased signatures for multi-signature attack.` : 'HNP lattice attack may be possible.'}`,
      relatedSignatures: relatedBiased.slice(0, 49),
      metadata: { 
        bitLength: rBitLength, 
        expectedBits: 256, 
        leadingZeros,
        clusterSize: relatedBiased.length + 1
      }
    })
  }
  
  return weaknesses
}

function detectSmallRValues(signatures: ParsedSignature[]): WeakSignature[] {
  const weaknesses: WeakSignature[] = []
  const threshold = SECP256K1_N / 10000n
  
  for (const sig of signatures) {
    if (sig.r < threshold) {
      weaknesses.push({
        signature: sig,
        weakness: 'small-r',
        severity: 'critical',
        description: `Extremely small r-value detected: ${sig.r.toString()}. This is a severe implementation flaw that may allow key recovery.`,
        metadata: { rValue: sig.r.toString() }
      })
    }
  }
  
  return weaknesses
}

function detectLowSValues(signatures: ParsedSignature[]): WeakSignature[] {
  const weaknesses: WeakSignature[] = []
  
  for (const sig of signatures) {
    if (sig.s > SECP256K1_HALF_N) {
      weaknesses.push({
        signature: sig,
        weakness: 'low-s',
        severity: 'low',
        description: `Non-canonical s-value detected (s > n/2). Not a security issue but violates BIP 146. Should use s = n - s.`,
        metadata: { canonical: false }
      })
    }
  }
  
  return weaknesses
}

function detectSimilarNonces(signatures: ParsedSignature[]): WeakSignature[] {
  const weaknesses: WeakSignature[] = []
  const sorted = [...signatures].sort((a, b) => {
    if (a.r < b.r) return -1
    if (a.r > b.r) return 1
    return 0
  })
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = sorted[i + 1].r - sorted[i].r
    const threshold = SECP256K1_N / 100000n
    
    if (diff > 0n && diff < threshold) {
      weaknesses.push({
        signature: sorted[i],
        weakness: 'similar-k',
        severity: 'high',
        description: `Similar nonce values detected: consecutive r-values differ by only ${diff.toString()}. This pattern suggests predictable nonce generation.`,
        relatedSignatures: [sorted[i + 1]],
        metadata: { difference: diff.toString() }
      })
    }
  }
  
  return weaknesses
}

function detectPatternClusters(signatures: ParsedSignature[]): PatternCluster[] {
  const clusters: PatternCluster[] = []
  
  const nonceReuseMap = new Map<string, ParsedSignature[]>()
  for (const sig of signatures) {
    const rStr = sig.r.toString()
    if (!nonceReuseMap.has(rStr)) {
      nonceReuseMap.set(rStr, [])
    }
    nonceReuseMap.get(rStr)!.push(sig)
  }
  
  for (const [rValue, sigs] of nonceReuseMap.entries()) {
    if (sigs.length > 2) {
      clusters.push({
        type: 'nonce-reuse',
        signatures: sigs,
        confidence: 1.0,
        severity: 'critical',
        description: `Nonce reuse cluster: ${sigs.length} signatures share r-value ${rValue.slice(0, 20)}...`,
        metadata: {
          rValue,
          clusterSize: sigs.length,
          addresses: [...new Set(sigs.map(s => s.address))]
        }
      })
    }
  }
  
  const sorted = [...signatures].sort((a, b) => {
    if (a.r < b.r) return -1
    if (a.r > b.r) return 1
    return 0
  })
  
  const sequentialClusters: ParsedSignature[][] = []
  let currentCluster: ParsedSignature[] = [sorted[0]]
  
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i].r - sorted[i - 1].r
    const maxDiff = SECP256K1_N / 10000n
    
    if (diff < maxDiff && diff > 0n) {
      currentCluster.push(sorted[i])
    } else {
      if (currentCluster.length >= 3) {
        sequentialClusters.push([...currentCluster])
      }
      currentCluster = [sorted[i]]
    }
  }
  
  if (currentCluster.length >= 3) {
    sequentialClusters.push(currentCluster)
  }
  
  for (const cluster of sequentialClusters) {
    clusters.push({
      type: 'sequential',
      signatures: cluster,
      confidence: 0.85,
      severity: 'high',
      description: `Sequential nonce pattern: ${cluster.length} signatures with incrementing nonces`,
      metadata: {
        clusterSize: cluster.length,
        pattern: 'incremental'
      }
    })
  }
  
  const rValues = signatures.map(s => s.r)
  const bitBias = calculateBitBias(rValues)
  
  if (bitBias.lsb > 0.15 && signatures.length >= 10) {
    const biasedSigs = signatures.slice(0, Math.min(50, signatures.length))
    clusters.push({
      type: 'biased-lsb',
      signatures: biasedSigs,
      confidence: Math.min(bitBias.lsb, 1.0),
      severity: bitBias.lsb > 0.3 ? 'critical' : (bitBias.lsb > 0.2 ? 'high' : 'medium'),
      description: `LSB bias detected across ${biasedSigs.length} signatures: ${(bitBias.lsb * 100).toFixed(1)}% deviation. Multi-signature HNP attack recommended.`,
      metadata: { bias: bitBias.lsb, bitPosition: 'lsb', signatureCount: biasedSigs.length }
    })
  }
  
  if (bitBias.msb > 0.15 && signatures.length >= 10) {
    const biasedSigs = signatures.slice(0, Math.min(50, signatures.length))
    clusters.push({
      type: 'biased-msb',
      signatures: biasedSigs,
      confidence: Math.min(bitBias.msb, 1.0),
      severity: bitBias.msb > 0.3 ? 'critical' : (bitBias.msb > 0.2 ? 'high' : 'medium'),
      description: `MSB bias detected across ${biasedSigs.length} signatures: ${(bitBias.msb * 100).toFixed(1)}% deviation. Multi-signature HNP attack recommended.`,
      metadata: { bias: bitBias.msb, bitPosition: 'msb', signatureCount: biasedSigs.length }
    })
  }
  
  const addressFreq = new Map<string, ParsedSignature[]>()
  for (const sig of signatures) {
    if (!addressFreq.has(sig.address)) {
      addressFreq.set(sig.address, [])
    }
    addressFreq.get(sig.address)!.push(sig)
  }
  
  for (const [address, sigs] of addressFreq.entries()) {
    if (sigs.length >= 5) {
      const localBias = calculateBitBias(sigs.map(s => s.r))
      if (localBias.lsb > 0.15 || localBias.msb > 0.15) {
        clusters.push({
          type: 'address-clustering',
          signatures: sigs,
          confidence: 0.7,
          severity: 'medium',
          description: `Address clustering: ${address.slice(0, 10)}... has ${sigs.length} signatures with weak entropy`,
          metadata: {
            address,
            signatureCount: sigs.length,
            bias: localBias
          }
        })
      }
    }
  }
  
  return clusters
}

export function analyzeSignatures(signatures: ParsedSignature[]): AnalysisResult {
  if (signatures.length === 0) {
    return {
      totalAnalyzed: 0,
      weakSignatures: [],
      patterns: [],
      statistics: {
        totalSignatures: 0,
        uniqueAddresses: 0,
        rValueDistribution: { min: 0n, max: 0n, mean: 0 },
        sValueDistribution: { min: 0n, max: 0n, mean: 0 },
        bitBias: { lsb: 0, msb: 0 },
        addressFrequency: new Map()
      }
    }
  }
  
  const weakSignatures: WeakSignature[] = [
    ...detectNonceReuse(signatures),
    ...detectBiasedNonces(signatures),
    ...detectSmallRValues(signatures),
    ...detectLowSValues(signatures),
    ...detectSimilarNonces(signatures)
  ]
  
  const uniqueWeaknesses = new Map<string, WeakSignature>()
  for (const weakness of weakSignatures) {
    const key = `${weakness.signature.hash}_${weakness.weakness}`
    if (!uniqueWeaknesses.has(key)) {
      uniqueWeaknesses.set(key, weakness)
    }
  }
  
  const patterns = detectPatternClusters(signatures)
  const statistics = calculateStatistics(signatures)
  
  return {
    totalAnalyzed: signatures.length,
    weakSignatures: Array.from(uniqueWeaknesses.values()),
    patterns,
    statistics
  }
}
