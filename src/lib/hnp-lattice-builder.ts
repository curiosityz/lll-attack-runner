import { ParsedSignature } from './dataParser'

const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')

export interface HNPLatticeConfig {
  signatures: ParsedSignature[]
  knownBits: number
  latticeType: 'standard' | 'embedded' | 'kannan'
}

export interface HNPLatticeResult {
  basis: number[][]
  dimension: number
  scalingFactor: bigint
  isNormalized: boolean
  metadata: {
    signatureCount: number
    knownBits: number
    latticeType: string
    estimatedComplexity: string
  }
}

export function buildHNPLattice(signatures: ParsedSignature[], knownBits: number = 4): HNPLatticeResult {
  const targetSigs = Math.max(40, Math.min(signatures.length, 80))
  const numSigs = Math.min(signatures.length, targetSigs)
  const sigs = signatures.slice(0, numSigs)
  
  const scale = 10n ** 60n
  const n_scaled = Number(SECP256K1_N / scale)
  
  const rValues = sigs.map(sig => Number(sig.r / scale))
  const sValues = sigs.map(sig => Number(sig.s / scale))
  const hashes = sigs.map(sig => {
    try {
      const hashBigInt = BigInt(sig.hash.startsWith('0x') ? sig.hash : '0x' + sig.hash)
      return Number(hashBigInt / scale)
    } catch {
      return 0
    }
  })
  
  const maxVal = Math.max(n_scaled, ...rValues, ...sValues, ...hashes.filter(h => h !== 0), 1)
  
  const targetMaxSafe = 2 ** 26
  const normFactor = maxVal / targetMaxSafe
  
  const n_norm = Math.floor(n_scaled / normFactor)
  const bound = Math.floor(Math.sqrt(n_norm) / (2 ** knownBits))
  
  const dimension = numSigs + 1
  const basis: number[][] = []
  
  for (let i = 0; i < numSigs; i++) {
    const row = new Array(dimension).fill(0)
    
    const r_norm = Math.floor(rValues[i] / normFactor)
    row[0] = r_norm
    
    row[i + 1] = bound
    
    basis.push(row)
  }
  
  const lastRow = new Array(dimension).fill(0)
  lastRow[0] = n_norm
  basis.push(lastRow)
  
  return {
    basis,
    dimension,
    scalingFactor: scale,
    isNormalized: true,
    metadata: {
      signatureCount: numSigs,
      knownBits,
      latticeType: 'standard',
      estimatedComplexity: estimateComplexity(dimension, knownBits)
    }
  }
}

export function buildEmbeddedHNPLattice(signatures: ParsedSignature[], knownBits: number = 4): HNPLatticeResult {
  const targetSigs = Math.max(35, Math.min(signatures.length, 60))
  const numSigs = Math.min(signatures.length, targetSigs)
  const sigs = signatures.slice(0, numSigs)
  
  const scale = 10n ** 60n
  const n_scaled = Number(SECP256K1_N / scale)
  
  const rValues = sigs.map(sig => Number(sig.r / scale))
  const hashes = sigs.map(sig => {
    try {
      const hashBigInt = BigInt(sig.hash.startsWith('0x') ? sig.hash : '0x' + sig.hash)
      return Number(hashBigInt / scale)
    } catch {
      return 0
    }
  })
  
  const maxVal = Math.max(n_scaled, ...rValues, ...hashes.filter(h => h !== 0), 1)
  
  const targetMaxSafe = 2 ** 26
  const normFactor = maxVal / targetMaxSafe
  
  const n_norm = Math.floor(n_scaled / normFactor)
  const bound = Math.floor(Math.sqrt(n_norm) / (2 ** knownBits))
  
  const dimension = numSigs + numSigs + 1
  const basis: number[][] = []
  
  for (let i = 0; i < numSigs; i++) {
    const row = new Array(dimension).fill(0)
    
    const r_norm = Math.floor(rValues[i] / normFactor)
    const h_norm = hashes[i] !== 0 ? Math.floor(hashes[i] / normFactor) : 0
    
    row[0] = r_norm
    row[i + 1] = bound
    row[numSigs + i + 1] = h_norm
    
    basis.push(row)
  }
  
  for (let i = 0; i < numSigs; i++) {
    const row = new Array(dimension).fill(0)
    row[numSigs + i + 1] = n_norm
    basis.push(row)
  }
  
  const lastRow = new Array(dimension).fill(0)
  lastRow[0] = n_norm * 2
  basis.push(lastRow)
  
  return {
    basis,
    dimension,
    scalingFactor: scale,
    isNormalized: true,
    metadata: {
      signatureCount: numSigs,
      knownBits,
      latticeType: 'embedded',
      estimatedComplexity: estimateComplexity(numSigs * 2, knownBits)
    }
  }
}

export function buildKannanEmbeddingLattice(signatures: ParsedSignature[], knownBits: number = 4): HNPLatticeResult {
  const targetSigs = Math.max(40, Math.min(signatures.length, 70))
  const numSigs = Math.min(signatures.length, targetSigs)
  const sigs = signatures.slice(0, numSigs)
  
  const scale = 10n ** 60n
  const n_scaled = Number(SECP256K1_N / scale)
  
  const rValues = sigs.map(sig => Number(sig.r / scale))
  const sValues = sigs.map(sig => Number(sig.s / scale))
  
  const maxVal = Math.max(n_scaled, ...rValues, ...sValues, 1)
  
  const targetMaxSafe = 2 ** 26
  const normFactor = maxVal / targetMaxSafe
  
  const n_norm = Math.floor(n_scaled / normFactor)
  const bound = Math.floor(Math.sqrt(n_norm) / (2 ** knownBits))
  const M = n_norm
  
  const dimension = numSigs + 2
  const basis: number[][] = []
  
  for (let i = 0; i < numSigs; i++) {
    const row = new Array(dimension).fill(0)
    
    const r_norm = Math.floor(rValues[i] / normFactor)
    const s_norm = Math.floor(sValues[i] / normFactor)
    
    row[0] = r_norm
    row[1] = s_norm
    row[i + 2] = bound
    
    basis.push(row)
  }
  
  const nRow = new Array(dimension).fill(0)
  nRow[0] = n_norm
  basis.push(nRow)
  
  const targetRow = new Array(dimension).fill(0)
  targetRow[1] = M
  basis.push(targetRow)
  
  return {
    basis,
    dimension,
    scalingFactor: scale,
    isNormalized: true,
    metadata: {
      signatureCount: numSigs,
      knownBits,
      latticeType: 'kannan',
      estimatedComplexity: estimateComplexity(numSigs + 2, knownBits)
    }
  }
}

function estimateComplexity(dimension: number, knownBits: number): string {
  const approxOps = Math.pow(dimension, 3) * Math.pow(2, knownBits)
  
  if (approxOps < 1e6) return 'Low (< 1s)'
  if (approxOps < 1e8) return 'Medium (1-10s)'
  if (approxOps < 1e10) return 'High (10-60s)'
  return 'Very High (> 1min)'
}

export function selectOptimalLatticeType(signatureCount: number, knownBits: number): 'standard' | 'embedded' | 'kannan' {
  if (signatureCount < 10) {
    return 'standard'
  }
  
  if (signatureCount >= 40) {
    return knownBits >= 4 ? 'embedded' : 'standard'
  }
  
  if (signatureCount >= 20 && signatureCount < 40) {
    return 'kannan'
  }
  
  return 'standard'
}
