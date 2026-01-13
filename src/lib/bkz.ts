import { LLLStep } from './types'
import { runLLL } from './lll'

export interface BKZResult {
  reducedBasis: number[][]
  iterations: number
  solutionVector?: number[]
  success: boolean
  steps?: LLLStep[]
  blockSize: number
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0)
}

function vectorNorm(v: number[]): number {
  return Math.sqrt(dotProduct(v, v))
}

function vectorSubtract(a: number[], b: number[]): number[] {
  return a.map((val, i) => val - b[i])
}

function vectorScale(v: number[], scalar: number): number[] {
  return v.map(val => val * scalar)
}

function gramSchmidt(basis: number[][]): { orthogonal: number[][], mu: number[][] } {
  const n = basis.length
  const orthogonal: number[][] = []
  const mu: number[][] = Array(n).fill(0).map(() => Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    let vec = [...basis[i]]
    
    for (let j = 0; j < i; j++) {
      const denom = dotProduct(orthogonal[j], orthogonal[j])
      if (denom > 1e-10) {
        mu[i][j] = dotProduct(basis[i], orthogonal[j]) / denom
        vec = vectorSubtract(vec, vectorScale(orthogonal[j], mu[i][j]))
      }
    }
    
    orthogonal.push(vec)
  }

  return { orthogonal, mu }
}

function projectBlock(basis: number[][], start: number, end: number): number[][] {
  const blockSize = end - start
  const projected: number[][] = []
  
  for (let i = start; i < end; i++) {
    projected.push([...basis[i]])
  }
  
  return projected
}

function enumerateSVP(basis: number[][], blockSize: number): number[] {
  const n = Math.min(blockSize, basis.length)
  const block = basis.slice(0, n)
  
  const { orthogonal } = gramSchmidt(block)
  
  let shortestVector = block[0]
  let shortestNorm = vectorNorm(shortestVector)
  
  for (let i = 0; i < block.length; i++) {
    const norm = vectorNorm(block[i])
    if (norm < shortestNorm) {
      shortestVector = block[i]
      shortestNorm = norm
    }
  }
  
  const combinations = Math.min(100, Math.pow(2, n))
  for (let mask = 1; mask < combinations; mask++) {
    let combination = new Array(block[0].length).fill(0)
    let coeffCount = 0
    
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        combination = combination.map((val, idx) => val + block[i][idx])
        coeffCount++
      }
    }
    
    if (coeffCount > 0) {
      const norm = vectorNorm(combination)
      if (norm > 1e-10 && norm < shortestNorm) {
        shortestVector = combination
        shortestNorm = norm
      }
    }
  }
  
  return shortestVector
}

export function runBKZ(
  basis: number[][], 
  blockSize: number = 10, 
  delta: number = 0.99,
  captureSteps: boolean = false,
  maxIterations: number = 50
): BKZResult {
  if (basis.length === 0 || basis[0].length === 0) {
    return { reducedBasis: basis, iterations: 0, success: false, blockSize }
  }

  const n = basis.length
  let reducedBasis = basis.map(row => [...row])
  let iterations = 0
  const steps: LLLStep[] = []
  
  if (captureSteps) {
    steps.push({
      iteration: 0,
      basis: reducedBasis.map(row => [...row]),
      k: 0,
      action: 'complete',
      description: `Initial basis - Starting BKZ-${blockSize}`
    })
  }

  let improved = true
  
  while (improved && iterations < maxIterations) {
    improved = false
    iterations++
    
    for (let i = 0; i < n; i++) {
      const blockEnd = Math.min(i + blockSize, n)
      
      if (blockEnd - i >= 2) {
        const block = reducedBasis.slice(i, blockEnd)
        const lllResult = runLLL(block, delta, false)
        
        for (let j = 0; j < lllResult.reducedBasis.length; j++) {
          if (i + j < n) {
            const oldNorm = vectorNorm(reducedBasis[i + j])
            const newNorm = vectorNorm(lllResult.reducedBasis[j])
            
            if (newNorm < oldNorm - 1e-6) {
              improved = true
            }
            
            reducedBasis[i + j] = lllResult.reducedBasis[j]
          }
        }
        
        if (blockSize >= 4 && blockEnd - i >= 3) {
          const shortVector = enumerateSVP(block, Math.min(blockSize, block.length))
          const shortNorm = vectorNorm(shortVector)
          const currentNorm = vectorNorm(reducedBasis[i])
          
          if (shortNorm < currentNorm - 1e-6) {
            reducedBasis[i] = shortVector
            improved = true
            
            if (captureSteps && steps.length < 150) {
              steps.push({
                iteration: iterations,
                basis: reducedBasis.map(row => [...row]),
                k: i,
                action: 'reduce',
                description: `BKZ: Found shorter vector at position ${i} (block ${i}-${blockEnd})`
              })
            }
          }
        }
      }
    }
    
    const finalLLL = runLLL(reducedBasis, delta, false)
    reducedBasis = finalLLL.reducedBasis
    
    if (captureSteps && improved && steps.length < 150) {
      steps.push({
        iteration: iterations,
        basis: reducedBasis.map(row => [...row]),
        k: 0,
        action: 'complete',
        description: `BKZ iteration ${iterations} complete - ${improved ? 'improved' : 'converged'}`
      })
    }
  }

  if (captureSteps) {
    steps.push({
      iteration: iterations,
      basis: reducedBasis.map(row => [...row]),
      k: 0,
      action: 'complete',
      description: `BKZ-${blockSize} reduction complete after ${iterations} iterations`
    })
  }

  const shortestVector = reducedBasis.reduce((shortest, vec) => {
    const currentNorm = vectorNorm(vec)
    const shortestNorm = vectorNorm(shortest)
    return currentNorm < shortestNorm ? vec : shortest
  }, reducedBasis[0])

  const hasZeroVector = reducedBasis.some(vec => 
    vec.every(val => Math.abs(val) < 1e-10)
  )

  return {
    reducedBasis,
    iterations,
    solutionVector: shortestVector,
    success: !hasZeroVector && iterations < maxIterations,
    steps: captureSteps ? steps : undefined,
    blockSize
  }
}
