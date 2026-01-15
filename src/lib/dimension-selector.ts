import { ParsedSignature } from './dataParser'

/**
 * Dimension Selector - Intelligent lattice dimension selection for BKZ attacks
 * 
 * Logic Flow:
 * 1. Analyze Input: Count total unique signatures available (N)
 * 2. Select d (Dimension):
 *    - If bias is suspected to be small (< 3 bits), set Matrix Dimension to 80x80
 *    - If bias is large (e.g., MSB leak), set Matrix Dimension to 40x40
 * 3. Batching: If user uploads 500 signatures, don't build a 500x500 matrix (it will hang)
 *    Instead, create random batches of 80 signatures and run parallel attacks
 * 4. Constraint: Ensure we always have d > 1.2 * (256 / expected_bias_bits) rows
 *    If we don't have enough rows, alert user 'Insufficient Data' rather than running a doomed attack
 */

export interface DimensionSelectionResult {
  selectedDimension: number
  batches: ParsedSignature[][]
  batchCount: number
  isValid: boolean
  insufficientDataReason?: string
  minRequiredRows: number
  expectedBiasBits: number
  recommendedBlockSize: number
}

export interface DimensionSelectorConfig {
  expectedBiasBits: number
  maxBatchSize?: number
  enableBatching?: boolean
}

// Bias thresholds
export const SMALL_BIAS_THRESHOLD = 3 // bits
export const LARGE_BIAS_THRESHOLD = 8 // bits (MSB leak typically reveals more bits)

// Dimension constants
const DIMENSION_FOR_SMALL_BIAS = 80
const DIMENSION_FOR_LARGE_BIAS = 40
const DEFAULT_BATCH_SIZE = 80
const MAX_SIGNATURES_BEFORE_BATCHING = 100

/**
 * Calculate the minimum required rows based on bias bits
 * Constraint: d > 1.2 * (256 / expected_bias_bits)
 */
export function calculateMinRequiredRows(expectedBiasBits: number): number {
  if (expectedBiasBits <= 0) {
    return Infinity // Can't attack with no bias
  }
  return Math.ceil(1.2 * (256 / expectedBiasBits))
}

/**
 * Select optimal dimension based on expected bias
 */
export function selectDimensionByBias(expectedBiasBits: number): number {
  if (expectedBiasBits < SMALL_BIAS_THRESHOLD) {
    return DIMENSION_FOR_SMALL_BIAS // 80x80 for small bias
  } else if (expectedBiasBits >= LARGE_BIAS_THRESHOLD) {
    return DIMENSION_FOR_LARGE_BIAS // 40x40 for large bias (MSB leak)
  } else {
    // For medium bias (3-7 bits), interpolate between 40 and 80
    const ratio = (expectedBiasBits - SMALL_BIAS_THRESHOLD) / (LARGE_BIAS_THRESHOLD - SMALL_BIAS_THRESHOLD)
    return Math.round(DIMENSION_FOR_SMALL_BIAS - ratio * (DIMENSION_FOR_SMALL_BIAS - DIMENSION_FOR_LARGE_BIAS))
  }
}

/**
 * Create random batches of signatures
 * Shuffles signatures and splits into batches of the specified size
 */
export function createSignatureBatches(
  signatures: ParsedSignature[],
  batchSize: number = DEFAULT_BATCH_SIZE
): ParsedSignature[][] {
  if (signatures.length <= batchSize) {
    return [signatures]
  }

  // Fisher-Yates shuffle for randomization
  const shuffled = [...signatures]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const batches: ParsedSignature[][] = []
  for (let i = 0; i < shuffled.length; i += batchSize) {
    const batch = shuffled.slice(i, i + batchSize)
    // Only include batches that are at least 60% of the target size
    // to avoid very small batches that won't be useful
    if (batch.length >= Math.floor(batchSize * 0.6)) {
      batches.push(batch)
    }
  }

  return batches
}

/**
 * Select optimal block size based on dimension
 */
export function selectBlockSize(dimension: number): number {
  if (dimension >= 60) {
    return Math.min(30, Math.ceil(dimension / 3))
  } else if (dimension >= 40) {
    return Math.min(25, Math.ceil(dimension / 3))
  } else if (dimension >= 20) {
    return Math.min(20, Math.ceil(dimension / 2))
  } else {
    return 10 // Small dimension - won't help anyway
  }
}

/**
 * Estimate bias bits from signature analysis
 * This analyzes the signatures to estimate how many bits of the nonce are predictable/biased
 */
export function estimateBiasBits(signatures: ParsedSignature[]): number {
  if (signatures.length < 2) {
    return 4 // Default assumption
  }

  // Analyze r-values for patterns
  const rValues = signatures.map(sig => sig.r)
  
  // Check for MSB bias (leading zeros in r-values)
  let msbBiasCount = 0
  let lsbBiasCount = 0
  const expectedBitLength = 256

  for (const r of rValues) {
    const bitLength = r.toString(2).length
    if (bitLength < expectedBitLength - 8) {
      msbBiasCount++
    }
    // Check LSB bias (lower bits showing patterns)
    if ((r & 0xFFn) < 0x10n) {
      lsbBiasCount++
    }
  }

  const msbBiasRatio = msbBiasCount / signatures.length
  const lsbBiasRatio = lsbBiasCount / signatures.length

  // If more than 30% of signatures show MSB bias, estimate higher bias
  if (msbBiasRatio > 0.3) {
    // MSB leak - typically 8+ bits exposed
    return Math.min(16, Math.round(8 + msbBiasRatio * 8))
  }

  // If LSB bias is detected
  if (lsbBiasRatio > 0.3) {
    return Math.min(8, Math.round(4 + lsbBiasRatio * 4))
  }

  // Check for nonce reuse (same r-values)
  const uniqueRValues = new Set(rValues.map(r => r.toString()))
  const reuseRatio = 1 - (uniqueRValues.size / rValues.length)
  
  if (reuseRatio > 0.1) {
    // Nonce reuse indicates very high bias
    return 256 // Full key recovery possible
  }

  // Default: assume small bias (conservative estimate)
  return 4
}

/**
 * Main dimension selection function
 * Analyzes signatures and returns optimal dimension configuration
 */
export function selectDimension(
  signatures: ParsedSignature[],
  config?: DimensionSelectorConfig
): DimensionSelectionResult {
  const totalSignatures = signatures.length
  
  // Determine expected bias bits
  let expectedBiasBits = config?.expectedBiasBits
  if (expectedBiasBits === undefined || expectedBiasBits <= 0) {
    expectedBiasBits = estimateBiasBits(signatures)
  }

  // Calculate minimum required rows
  const minRequiredRows = calculateMinRequiredRows(expectedBiasBits)
  
  // Check if we have sufficient data
  const isValid = totalSignatures >= minRequiredRows && minRequiredRows > 1
  
  if (!isValid) {
    const insufficientDataReason = minRequiredRows === Infinity
      ? 'Cannot estimate bias. Unable to determine attack parameters.'
      : `Insufficient Data: Need at least ${minRequiredRows} signatures for ${expectedBiasBits}-bit bias attack, but only have ${totalSignatures}.`
    
    return {
      selectedDimension: 0,
      batches: [],
      batchCount: 0,
      isValid: false,
      insufficientDataReason,
      minRequiredRows: minRequiredRows === Infinity ? totalSignatures + 1 : minRequiredRows,
      expectedBiasBits,
      recommendedBlockSize: 0
    }
  }

  // Select dimension based on bias
  let selectedDimension = selectDimensionByBias(expectedBiasBits)
  
  // Cap dimension to available signatures
  selectedDimension = Math.min(selectedDimension, totalSignatures)
  
  // Ensure dimension is at least the minimum required
  selectedDimension = Math.max(selectedDimension, minRequiredRows)

  const maxBatchSize = config?.maxBatchSize ?? DEFAULT_BATCH_SIZE
  const enableBatching = config?.enableBatching ?? true

  // Create batches if we have too many signatures
  let batches: ParsedSignature[][]
  if (enableBatching && totalSignatures > MAX_SIGNATURES_BEFORE_BATCHING) {
    batches = createSignatureBatches(signatures, maxBatchSize)
  } else {
    // Use a single batch with optimal dimension worth of signatures
    batches = [signatures.slice(0, selectedDimension)]
  }

  const recommendedBlockSize = selectBlockSize(selectedDimension)

  return {
    selectedDimension,
    batches,
    batchCount: batches.length,
    isValid: true,
    minRequiredRows,
    expectedBiasBits,
    recommendedBlockSize
  }
}

/**
 * Get a human-readable description of the dimension selection
 */
export function getDimensionSelectionDescription(result: DimensionSelectionResult): string {
  if (!result.isValid) {
    return result.insufficientDataReason || 'Insufficient data for attack'
  }

  const biasDesc = result.expectedBiasBits < SMALL_BIAS_THRESHOLD
    ? 'small (< 3 bits)'
    : result.expectedBiasBits >= LARGE_BIAS_THRESHOLD
    ? 'large (MSB leak)'
    : 'medium'

  let desc = `Dimension: ${result.selectedDimension}×${result.selectedDimension} | Bias: ${biasDesc} (${result.expectedBiasBits} bits)`
  
  if (result.batchCount > 1) {
    desc += ` | Batches: ${result.batchCount} × ${result.batches[0]?.length || 0} signatures`
  }

  desc += ` | Block Size: ${result.recommendedBlockSize}`

  return desc
}

/**
 * Validate that the current configuration meets constraints
 * Returns true if valid, or an error message if invalid
 */
export function validateDimensionConstraints(
  dimension: number,
  expectedBiasBits: number
): { valid: boolean; message?: string } {
  const minRequired = calculateMinRequiredRows(expectedBiasBits)
  
  if (dimension <= 1) {
    return { valid: false, message: 'Dimension must be greater than 1' }
  }
  
  if (dimension < minRequired) {
    return {
      valid: false,
      message: `Insufficient Data: Dimension ${dimension} is less than required ${minRequired} for ${expectedBiasBits}-bit bias attack. Need ${minRequired - dimension} more signatures.`
    }
  }

  return { valid: true }
}
