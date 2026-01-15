import { BigIntMatrix, convertToSafeNumbers, convertFromSafeNumbers, bigintAbs, bigintMax, SECP256K1_N } from './bigint-math'
import { runBigIntLLL, runBigIntBKZ, buildHNPLattice, buildNonceReuseLattice } from './bigint-lll'
import { runLLL } from './lll'
import { runBKZ } from './bkz'

export interface PrecisionLatticeResult {
  reducedBasis: number[][]
  success: boolean
  iterations: number
  solutionVector?: number[]
  usedHighPrecision: boolean
  originalScale?: bigint
  blockSize?: number
}

function needsHighPrecision(basis: number[][]): boolean {
  const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
  const MIN_SAFE_INTEGER = Number.MIN_SAFE_INTEGER
  
  for (const row of basis) {
    for (const val of row) {
      if (val > MAX_SAFE_INTEGER || val < MIN_SAFE_INTEGER) {
        return true
      }
      if (!Number.isInteger(val) && Math.abs(val) > 1e15) {
        return true
      }
    }
  }
  
  return false
}

function detectScale(basis: number[][]): bigint {
  let maxAbs = 0
  for (const row of basis) {
    for (const val of row) {
      const abs = Math.abs(val)
      if (abs > maxAbs && Number.isFinite(abs)) {
        maxAbs = abs
      }
    }
  }
  
  if (maxAbs > 1e20) {
    return BigInt(Math.floor(maxAbs))
  }
  
  return 1n
}

export function runPrecisionLLL(
  basis: number[][],
  delta: number = 0.75,
  captureVisualization: boolean = false
): PrecisionLatticeResult {
  const requiresHighPrecision = needsHighPrecision(basis)
  
  if (!requiresHighPrecision) {
    const result = runLLL(basis, delta, captureVisualization)
    return {
      reducedBasis: result.reducedBasis,
      success: result.success,
      iterations: result.iterations,
      solutionVector: result.solutionVector,
      usedHighPrecision: false
    }
  }
  
  const originalScale = detectScale(basis)
  const bigintBasis = basis.map(row => 
    row.map(val => {
      if (originalScale > 1n) {
        return BigInt(Math.floor(val))
      }
      return BigInt(Math.floor(val * 1e6)) / 1000000n
    })
  )
  
  const result = runBigIntLLL(bigintBasis, delta, 10000)
  
  const reducedBasis = result.reducedBasis.map(row =>
    row.map(val => {
      if (originalScale > 1n) {
        return Number(val)
      }
      return Number(val) / 1e6
    })
  )
  
  const solutionVector = result.solutionVector?.map(val => {
    if (originalScale > 1n) {
      return Number(val)
    }
    return Number(val) / 1e6
  })
  
  return {
    reducedBasis,
    success: result.success,
    iterations: result.iterations,
    solutionVector,
    usedHighPrecision: true,
    originalScale
  }
}

export function runPrecisionBKZ(
  basis: number[][],
  blockSize: number,
  delta: number = 0.99,
  captureVisualization: boolean = false
): PrecisionLatticeResult {
  const requiresHighPrecision = needsHighPrecision(basis)
  
  if (!requiresHighPrecision) {
    const result = runBKZ(basis, blockSize, delta, captureVisualization)
    return {
      reducedBasis: result.reducedBasis,
      success: result.success,
      iterations: result.iterations,
      solutionVector: result.solutionVector,
      usedHighPrecision: false,
      blockSize: result.blockSize
    }
  }
  
  const originalScale = detectScale(basis)
  const bigintBasis = basis.map(row => 
    row.map(val => {
      if (originalScale > 1n) {
        return BigInt(Math.floor(val))
      }
      return BigInt(Math.floor(val * 1e6)) / 1000000n
    })
  )
  
  const result = runBigIntBKZ(bigintBasis, blockSize, delta, 1000)
  
  const reducedBasis = result.reducedBasis.map(row =>
    row.map(val => {
      if (originalScale > 1n) {
        return Number(val)
      }
      return Number(val) / 1e6
    })
  )
  
  const solutionVector = result.solutionVector?.map(val => {
    if (originalScale > 1n) {
      return Number(val)
    }
    return Number(val) / 1e6
  })
  
  return {
    reducedBasis,
    success: result.success,
    iterations: result.iterations,
    solutionVector,
    usedHighPrecision: true,
    originalScale,
    blockSize
  }
}

export function buildPrecisionHNPLattice(
  signatures: Array<{ r: bigint; s: bigint; z: bigint }>,
  bitsBiased: number = 8
): number[][] {
  const lattice = buildHNPLattice(signatures, SECP256K1_N, bitsBiased)
  return convertToSafeNumbers(lattice, 52)
}

export function buildPrecisionNonceReuseLattice(
  sig1: { r: bigint; s: bigint; z: bigint },
  sig2: { r: bigint; s: bigint; z: bigint }
): number[][] {
  const lattice = buildNonceReuseLattice(sig1, sig2, SECP256K1_N)
  return convertToSafeNumbers(lattice, 52)
}

export function convertBasisToBigInt(basis: number[][]): bigint[][] {
  return basis.map(row => row.map(val => BigInt(Math.floor(val))))
}

export function convertBasisToNumber(basis: bigint[][]): number[][] {
  return basis.map(row => row.map(val => Number(val)))
}
