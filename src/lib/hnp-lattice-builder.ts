import { ParsedSignature } from './dataParser'
import { 
  selectDimension, 
  DimensionSelectionResult, 
  DimensionSelectorConfig,
  validateDimensionConstraints,
  selectBlockSize
} from './dimension-selector'

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
  /** Dimension selection result from the intelligent selector */
  dimensionSelection?: DimensionSelectionResult
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

/**
 * Batch result from intelligent HNP lattice building
 */
export interface BatchHNPLatticeResult {
  batches: HNPLatticeResult[]
  dimensionSelection: DimensionSelectionResult
  isValid: boolean
  insufficientDataReason?: string
  recommendedBlockSize: number
}

/**
 * Build HNP lattice with intelligent dimension selection
 * 
 * This function uses the Dimension Selector to:
 * 1. Analyze the bias in signatures
 * 2. Select optimal dimension (80x80 for small bias, 40x40 for large bias)
 * 3. Create batches if there are too many signatures (prevents 500x500 matrices)
 * 4. Validate that d > 1.2 * (256 / expected_bias_bits)
 * 
 * @param signatures - Array of parsed signatures
 * @param config - Optional configuration for dimension selection
 * @returns Batch result with dimension selection info and lattice batches
 */
export function buildHNPLatticeWithDimensionSelection(
  signatures: ParsedSignature[],
  config?: DimensionSelectorConfig
): BatchHNPLatticeResult {
  // Step 1: Use Dimension Selector to analyze input and select optimal dimension
  const dimensionSelection = selectDimension(signatures, config)
  
  // Step 2: Check if we have sufficient data
  if (!dimensionSelection.isValid) {
    return {
      batches: [],
      dimensionSelection,
      isValid: false,
      insufficientDataReason: dimensionSelection.insufficientDataReason,
      recommendedBlockSize: 0
    }
  }

  const knownBits = config?.expectedBiasBits ?? dimensionSelection.expectedBiasBits
  
  // Step 3: Build lattices for each batch
  const batches: HNPLatticeResult[] = dimensionSelection.batches.map((batch, index) => {
    // Determine lattice type based on batch size
    const latticeType = selectOptimalLatticeType(batch.length, knownBits)
    
    let result: HNPLatticeResult
    if (latticeType === 'embedded') {
      result = buildEmbeddedHNPLattice(batch, knownBits)
    } else if (latticeType === 'kannan') {
      result = buildKannanEmbeddingLattice(batch, knownBits)
    } else {
      result = buildHNPLattice(batch, knownBits)
    }
    
    // Add dimension selection info
    result.dimensionSelection = dimensionSelection
    
    return result
  })

  return {
    batches,
    dimensionSelection,
    isValid: true,
    recommendedBlockSize: dimensionSelection.recommendedBlockSize
  }
}

/**
 * Validate if the current lattice configuration meets the dimension constraints
 * 
 * @param signatureCount - Number of signatures
 * @param expectedBiasBits - Expected bias in bits
 * @returns Validation result with error message if invalid
 */
export function validateLatticeConfiguration(
  signatureCount: number,
  expectedBiasBits: number
): { valid: boolean; message?: string } {
  return validateDimensionConstraints(signatureCount, expectedBiasBits)
}

/**
 * Get recommended block size for a given dimension
 */
export { selectBlockSize } from './dimension-selector'
