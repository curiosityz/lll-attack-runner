/**
 * High-Precision LLL Algorithm using Exact Rational Arithmetic
 * 
 * This implementation is inspired by fpylll/fplll and SageMath's approach to
 * lattice reduction. Key improvements over the standard BigInt implementation:
 * 
 * 1. Uses exact rational arithmetic for Gram-Schmidt coefficients (μ values)
 * 2. Exact Lovász condition checking without floating-point errors
 * 3. Proper size reduction with exact rounding
 * 
 * For cryptographic applications (secp256k1, 256-bit integers), this provides
 * the numerical stability required for successful attacks.
 * 
 * References:
 * - fpylll: https://github.com/fplll/fpylll
 * - fplll: https://github.com/fplll/fplll
 * - SageMath LLL: https://doc.sagemath.org/html/en/reference/matrices/sage/matrix/matrix_integer_dense.html
 * 
 * Note: For production-critical cryptographic research, consider using
 * fpylll/fplll or SageMath directly, as they provide additional optimizations
 * (LLL with early termination, BKZ 2.0, etc.) and have been extensively tested.
 */

import {
  Rational,
  rationalDotProduct,
  rationalNormSquared,
  rationalGramSchmidt,
  checkLovaszCondition,
  deltaToRational,
  subtractBigIntVectors,
  scaleBigIntVector
} from './rational'
import { vectorNorm, sqrt } from './bigint-math'

export interface HighPrecisionLLLResult {
  reducedBasis: bigint[][]
  success: boolean
  iterations: number
  solutionVector?: bigint[]
  usedRationalArithmetic: boolean
}

/**
 * High-precision LLL reduction using exact rational arithmetic.
 * 
 * This implementation follows the standard LLL algorithm but uses rational
 * numbers for all Gram-Schmidt computations, ensuring no precision loss.
 * 
 * @param basisInput - Input lattice basis as 2D BigInt array
 * @param delta - LLL parameter (0.25 < δ ≤ 1), default 0.75
 * @param maxIterations - Maximum iterations before termination
 * @returns Reduced basis with metadata
 */
export function runHighPrecisionLLL(
  basisInput: bigint[][],
  delta: number = 0.75,
  maxIterations: number = 10000
): HighPrecisionLLLResult {
  // Validate delta
  if (delta <= 0.25 || delta > 1) {
    throw new Error('Delta must be in range (0.25, 1]')
  }

  const n = basisInput.length
  if (n === 0) {
    return {
      reducedBasis: [],
      success: false,
      iterations: 0,
      usedRationalArithmetic: true
    }
  }

  // Convert delta to exact rational
  const deltaRational = deltaToRational(delta)

  // Working copy of the basis
  const basis = basisInput.map(row => [...row])

  let iterations = 0
  let k = 1
  let stuckCounter = 0
  let lastK = k

  // Main LLL loop
  while (k < n && iterations < maxIterations) {
    iterations++

    // Detect if we're stuck
    if (k === lastK) {
      stuckCounter++
      if (stuckCounter > 100) {
        console.warn(`High-precision LLL stuck at k=${k} after 100 iterations`)
        break
      }
    } else {
      stuckCounter = 0
      lastK = k
    }

    // Compute Gram-Schmidt with exact rational arithmetic
    const { mu, Bsquared } = rationalGramSchmidt(basis)

    // Size reduction: make |μ_{k,j}| ≤ 0.5 for all j < k
    for (let j = k - 1; j >= 0; j--) {
      const muKJ = mu[k][j]

      // Check if |μ_{k,j}| > 0.5
      const halfPositive = new Rational(1n, 2n)
      const halfNegative = new Rational(-1n, 2n)

      if (muKJ.greaterThan(halfPositive) || muKJ.lessThan(halfNegative)) {
        // Round μ_{k,j} to nearest integer
        const q = muKJ.round()

        if (q !== 0n) {
          // basis[k] = basis[k] - q * basis[j]
          const scaled = scaleBigIntVector(basis[j], q)
          basis[k] = subtractBigIntVectors(basis[k], scaled)
        }
      }
    }

    // Recompute Gram-Schmidt after size reduction
    const { mu: muNew, Bsquared: BsquaredNew } = rationalGramSchmidt(basis)

    // Check Lovász condition: ||B*_k||² ≥ (δ - μ_{k,k-1}²) * ||B*_{k-1}||²
    if (checkLovaszCondition(BsquaredNew, muNew, k, deltaRational)) {
      // Condition satisfied, move forward
      k++
    } else {
      // Swap basis[k] and basis[k-1]
      ;[basis[k], basis[k - 1]] = [basis[k - 1], basis[k]]
      // Move back (but not below 1)
      k = Math.max(1, k - 1)
    }
  }

  // Find the shortest non-zero vector
  let shortestVector = basis[0]
  let shortestNorm = vectorNorm(shortestVector)

  for (let i = 1; i < basis.length; i++) {
    const norm = vectorNorm(basis[i])
    if (norm > 0n && (shortestNorm === 0n || norm < shortestNorm)) {
      shortestNorm = norm
      shortestVector = basis[i]
    }
  }

  return {
    reducedBasis: basis,
    success: iterations < maxIterations,
    iterations,
    solutionVector: shortestVector,
    usedRationalArithmetic: true
  }
}

/**
 * High-precision BKZ (Block Korkine-Zolotarev) reduction.
 * 
 * BKZ applies LLL to overlapping blocks of the basis, then uses
 * SVP enumeration to find shorter vectors within each block.
 * 
 * This implementation uses the high-precision LLL as a subroutine.
 * 
 * @param basisInput - Input lattice basis as 2D BigInt array
 * @param blockSize - BKZ block size (β ≥ 2)
 * @param delta - LLL parameter (0.25 < δ ≤ 1), default 0.99
 * @param maxRounds - Maximum BKZ rounds
 * @returns Reduced basis with metadata
 */
export function runHighPrecisionBKZ(
  basisInput: bigint[][],
  blockSize: number,
  delta: number = 0.99,
  maxRounds: number = 50
): HighPrecisionLLLResult {
  if (blockSize < 2) {
    throw new Error('Block size must be at least 2')
  }

  const n = basisInput.length
  if (n === 0) {
    return {
      reducedBasis: [],
      success: false,
      iterations: 0,
      usedRationalArithmetic: true
    }
  }

  // Limit iterations based on dimension
  const adaptiveMaxRounds = Math.min(
    maxRounds,
    n >= 40 ? 20 : n >= 20 ? 35 : 50
  )

  // Working copy of the basis
  let basis = basisInput.map(row => [...row])
  let totalIterations = 0
  let rounds = 0
  let improved = true

  // Initial LLL reduction
  const initialLLL = runHighPrecisionLLL(basis, delta, 1000)
  basis = initialLLL.reducedBasis
  totalIterations += initialLLL.iterations

  while (improved && rounds < adaptiveMaxRounds) {
    improved = false
    rounds++

    // Process each block
    for (let i = 0; i < n - 1; i++) {
      const blockEnd = Math.min(i + blockSize, n)
      const block = basis.slice(i, blockEnd)

      // LLL reduce the block
      const blockLLL = runHighPrecisionLLL(block, delta, 500)
      totalIterations += blockLLL.iterations

      // Check if we improved
      for (let j = 0; j < block.length; j++) {
        const oldNorm = vectorNorm(basis[i + j])
        const newNorm = vectorNorm(blockLLL.reducedBasis[j])
        if (newNorm < oldNorm) {
          improved = true
        }
        basis[i + j] = blockLLL.reducedBasis[j]
      }

      // SVP enumeration for larger blocks
      if (blockSize >= 4 && blockEnd - i >= 3) {
        const shortVector = enumerateSVPBigInt(block, Math.min(blockSize, block.length))
        if (shortVector) {
          const shortNorm = vectorNorm(shortVector)
          const currentNorm = vectorNorm(basis[i])
          if (shortNorm > 0n && shortNorm < currentNorm) {
            basis[i] = shortVector
            improved = true
          }
        }
      }

      // Early termination if we've done too many iterations
      if (totalIterations > adaptiveMaxRounds * 1000) {
        improved = false
        break
      }
    }

    // Final LLL pass after each BKZ round
    const finalLLL = runHighPrecisionLLL(basis, delta, 200)
    basis = finalLLL.reducedBasis
    totalIterations += finalLLL.iterations
  }

  // Find shortest non-zero vector
  let shortestVector = basis[0]
  let shortestNorm = vectorNorm(shortestVector)

  for (let i = 1; i < basis.length; i++) {
    const norm = vectorNorm(basis[i])
    if (norm > 0n && (shortestNorm === 0n || norm < shortestNorm)) {
      shortestNorm = norm
      shortestVector = basis[i]
    }
  }

  return {
    reducedBasis: basis,
    success: rounds < maxRounds,
    iterations: totalIterations,
    solutionVector: shortestVector,
    usedRationalArithmetic: true
  }
}

/**
 * Simple SVP enumeration using combinations of basis vectors.
 * For larger block sizes, this is exponential but provides better results.
 */
function enumerateSVPBigInt(block: bigint[][], maxVectors: number): bigint[] | null {
  const n = Math.min(maxVectors, block.length)
  if (n === 0) return null

  let shortestVector = block[0]
  let shortestNorm = vectorNorm(shortestVector)

  // First, check individual vectors
  for (let i = 1; i < n; i++) {
    const norm = vectorNorm(block[i])
    if (norm > 0n && (shortestNorm === 0n || norm < shortestNorm)) {
      shortestNorm = norm
      shortestVector = block[i]
    }
  }

  // Try small linear combinations
  const maxCombinations = Math.min(100, Math.pow(3, n))
  const m = block[0].length

  for (let mask = 1; mask < maxCombinations; mask++) {
    const combination = new Array(m).fill(0n)
    let temp = mask

    for (let i = 0; i < n && temp > 0; i++) {
      const coef = (temp % 3) - 1 // -1, 0, or 1
      temp = Math.floor(temp / 3)

      if (coef !== 0) {
        for (let j = 0; j < m; j++) {
          combination[j] += BigInt(coef) * block[i][j]
        }
      }
    }

    const norm = vectorNorm(combination)
    if (norm > 0n && (shortestNorm === 0n || norm < shortestNorm)) {
      shortestNorm = norm
      shortestVector = [...combination]
    }
  }

  return shortestVector
}
