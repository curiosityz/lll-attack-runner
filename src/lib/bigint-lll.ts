import {
  BigIntMatrix,
  dotProduct,
  vectorNorm,
  subtractVectors,
  scaleVector,
  bigintAbs,
  sqrt
} from './bigint-math'

export interface BigIntLLLResult {
  reducedBasis: bigint[][]
  success: boolean
  iterations: number
  solutionVector?: bigint[]
}

function computeGSO(basis: bigint[][]): { mu: number[][], B: bigint[][] } {
  const n = basis.length
  const B: bigint[][] = []
  const mu: number[][] = Array(n).fill(0).map(() => Array(n).fill(0))
  
  for (let i = 0; i < n; i++) {
    B[i] = [...basis[i]]
    
    for (let j = 0; j < i; j++) {
      const numerator = dotProduct(basis[i], B[j])
      const denominator = dotProduct(B[j], B[j])
      
      if (denominator !== 0n) {
        mu[i][j] = Number(numerator) / Number(denominator)
        const scaled = scaleVector(B[j], BigInt(Math.round(mu[i][j] * 1000000)))
        const scaledDown = scaled.map(x => x / 1000000n)
        B[i] = subtractVectors(B[i], scaledDown)
      }
    }
  }
  
  return { mu, B }
}

function lovaszCondition(
  B: bigint[][],
  mu: number[][],
  k: number,
  delta: number
): boolean {
  if (k === 0) return true
  
  const Bk = dotProduct(B[k], B[k])
  const Bk1 = dotProduct(B[k - 1], B[k - 1])
  
  if (Bk1 === 0n) return true
  
  const leftSide = Number(Bk)
  const rightSide = (delta - mu[k][k - 1] * mu[k][k - 1]) * Number(Bk1)
  
  return leftSide >= rightSide
}

export function runBigIntLLL(
  basisInput: bigint[][],
  delta: number = 0.75,
  maxIterations: number = 10000
): BigIntLLLResult {
  if (delta <= 0.25 || delta >= 1) {
    throw new Error('Delta must be between 0.25 and 1')
  }
  
  const n = basisInput.length
  if (n === 0) {
    return { reducedBasis: [], success: false, iterations: 0 }
  }
  
  const basis = basisInput.map(row => [...row])
  let iterations = 0
  let k = 1
  
  while (k < n && iterations < maxIterations) {
    iterations++
    
    const { mu, B } = computeGSO(basis)
    
    for (let j = k - 1; j >= 0; j--) {
      const muKJ = mu[k][j]
      if (Math.abs(muKJ) > 0.5) {
        const q = BigInt(Math.round(muKJ))
        const scaled = scaleVector(basis[j], q)
        basis[k] = subtractVectors(basis[k], scaled)
      }
    }
    
    const { mu: muNew, B: BNew } = computeGSO(basis)
    
    if (!lovaszCondition(BNew, muNew, k, delta)) {
      [basis[k], basis[k - 1]] = [basis[k - 1], basis[k]]
      k = Math.max(1, k - 1)
    } else {
      k++
    }
  }
  
  let shortestVector = basis[0]
  let shortestNorm = vectorNorm(shortestVector)
  
  for (let i = 1; i < basis.length; i++) {
    const norm = vectorNorm(basis[i])
    if (norm < shortestNorm) {
      shortestNorm = norm
      shortestVector = basis[i]
    }
  }
  
  return {
    reducedBasis: basis,
    success: iterations < maxIterations,
    iterations,
    solutionVector: shortestVector
  }
}

export function runBigIntBKZ(
  basisInput: bigint[][],
  blockSize: number,
  delta: number = 0.99,
  maxIterations: number = 1000
): BigIntLLLResult {
  if (blockSize < 2) {
    throw new Error('Block size must be at least 2')
  }
  
  const n = basisInput.length
  if (n === 0) {
    return { reducedBasis: [], success: false, iterations: 0 }
  }
  
  const basis = basisInput.map(row => [...row])
  let totalIterations = 0
  let improved = true
  let rounds = 0
  
  while (improved && rounds < maxIterations) {
    improved = false
    rounds++
    
    for (let i = 0; i < n - 1; i++) {
      const endIdx = Math.min(i + blockSize, n)
      const block = basis.slice(i, endIdx)
      
      const blockResult = runBigIntLLL(block, delta, 500)
      totalIterations += blockResult.iterations
      
      for (let j = 0; j < block.length; j++) {
        if (!arraysEqual(basis[i + j], blockResult.reducedBasis[j])) {
          improved = true
        }
        basis[i + j] = blockResult.reducedBasis[j]
      }
    }
    
    const lllResult = runBigIntLLL(basis, delta, 100)
    totalIterations += lllResult.iterations
    
    for (let i = 0; i < n; i++) {
      basis[i] = lllResult.reducedBasis[i]
    }
  }
  
  let shortestVector = basis[0]
  let shortestNorm = vectorNorm(shortestVector)
  
  for (let i = 1; i < basis.length; i++) {
    const norm = vectorNorm(basis[i])
    if (norm < shortestNorm) {
      shortestNorm = norm
      shortestVector = basis[i]
    }
  }
  
  return {
    reducedBasis: basis,
    success: rounds < maxIterations,
    iterations: totalIterations,
    solutionVector: shortestVector
  }
}

function arraysEqual(a: bigint[], b: bigint[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export function buildHNPLattice(
  signatures: Array<{ r: bigint; s: bigint; z: bigint }>,
  n: bigint,
  bitsBiased: number
): bigint[][] {
  const k = signatures.length
  const bound = 2n ** BigInt(bitsBiased)
  
  const basis: bigint[][] = []
  
  const firstRow = [n, ...Array(k + 1).fill(0n)]
  basis.push(firstRow)
  
  for (let i = 0; i < k; i++) {
    const sig = signatures[i]
    const t = (sig.s * modInverse(sig.r, n)) % n
    
    const row = Array(k + 2).fill(0n)
    row[0] = t
    row[i + 1] = bound
    basis.push(row)
  }
  
  const lastRow = Array(k + 2).fill(0n)
  lastRow[k + 1] = bound
  basis.push(lastRow)
  
  return basis
}

export function buildNonceReuseLattice(
  sig1: { r: bigint; s: bigint; z: bigint },
  sig2: { r: bigint; s: bigint; z: bigint },
  n: bigint
): bigint[][] {
  const r = sig1.r
  const s1 = sig1.s
  const s2 = sig2.s
  const z1 = sig1.z
  const z2 = sig2.z
  
  const sDiff = (s1 - s2 + n) % n
  const zDiff = (z1 - z2 + n) % n
  
  return [
    [n, 0n, 0n],
    [r, sDiff, 0n],
    [0n, 0n, zDiff]
  ]
}

function modInverse(a: bigint, m: bigint): bigint {
  a = ((a % m) + m) % m
  
  if (a === 0n) {
    throw new Error('No modular inverse exists')
  }
  
  let [old_r, r] = [a, m]
  let [old_s, s] = [1n, 0n]
  
  while (r !== 0n) {
    const quotient = old_r / r
    ;[old_r, r] = [r, old_r - quotient * r]
    ;[old_s, s] = [s, old_s - quotient * s]
  }
  
  if (old_r > 1n) {
    throw new Error('No modular inverse exists')
  }
  
  if (old_s < 0n) {
    old_s += m
  }
  
  return old_s
}
