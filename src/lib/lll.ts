import { LLLStep } from './types'

export interface LLLResult {
  reducedBasis: number[][]
  iterations: number
  solutionVector?: number[]
  success: boolean
  steps?: LLLStep[]
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0)
}

function vectorSubtract(a: number[], b: number[]): number[] {
  return a.map((val, i) => val - b[i])
}

function vectorScale(v: number[], scalar: number): number[] {
  return v.map(val => val * scalar)
}

function vectorAdd(a: number[], b: number[]): number[] {
  return a.map((val, i) => val + b[i])
}

function vectorNorm(v: number[]): number {
  return Math.sqrt(dotProduct(v, v))
}

function gramSchmidt(basis: number[][]): { orthogonal: number[][], mu: number[][] } {
  const n = basis.length
  const orthogonal: number[][] = []
  const mu: number[][] = Array(n).fill(0).map(() => Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    let vec = [...basis[i]]
    
    for (let j = 0; j < i; j++) {
      mu[i][j] = dotProduct(basis[i], orthogonal[j]) / dotProduct(orthogonal[j], orthogonal[j])
      vec = vectorSubtract(vec, vectorScale(orthogonal[j], mu[i][j]))
    }
    
    orthogonal.push(vec)
  }

  return { orthogonal, mu }
}

function lovaszCondition(
  orthogonal: number[][],
  k: number,
  delta: number,
  mu: number[][]
): boolean {
  const left = dotProduct(orthogonal[k], orthogonal[k])
  const right = (delta - mu[k][k - 1] ** 2) * dotProduct(orthogonal[k - 1], orthogonal[k - 1])
  return left >= right
}

export function runLLL(basis: number[][], delta: number = 0.75, captureSteps: boolean = false): LLLResult {
  if (basis.length === 0 || basis[0].length === 0) {
    return { reducedBasis: basis, iterations: 0, success: false }
  }

  const n = basis.length
  const reducedBasis = basis.map(row => [...row])
  let iterations = 0
  const maxIterations = 10000
  const steps: LLLStep[] = []

  if (captureSteps) {
    steps.push({
      iteration: 0,
      basis: reducedBasis.map(row => [...row]),
      k: 1,
      action: 'complete',
      description: 'Initial basis'
    })
  }

  let k = 1

  while (k < n && iterations < maxIterations) {
    iterations++

    const { orthogonal, mu } = gramSchmidt(reducedBasis)

    for (let j = k - 1; j >= 0; j--) {
      const muKJ = mu[k][j]
      if (Math.abs(muKJ) > 0.5) {
        const q = Math.round(muKJ)
        reducedBasis[k] = vectorSubtract(reducedBasis[k], vectorScale(reducedBasis[j], q))
        
        if (captureSteps && steps.length < 100) {
          steps.push({
            iteration: iterations,
            basis: reducedBasis.map(row => [...row]),
            k,
            action: 'reduce',
            description: `Reduced vector ${k} using vector ${j}`
          })
        }
      }
    }

    const { orthogonal: newOrthogonal, mu: newMu } = gramSchmidt(reducedBasis)

    if (lovaszCondition(newOrthogonal, k, delta, newMu)) {
      k++
    } else {
      [reducedBasis[k], reducedBasis[k - 1]] = [reducedBasis[k - 1], reducedBasis[k]]
      
      if (captureSteps && steps.length < 100) {
        steps.push({
          iteration: iterations,
          basis: reducedBasis.map(row => [...row]),
          k,
          action: 'swap',
          description: `Swapped vectors ${k} and ${k - 1}`
        })
      }
      
      k = Math.max(1, k - 1)
    }
  }

  if (captureSteps) {
    steps.push({
      iteration: iterations,
      basis: reducedBasis.map(row => [...row]),
      k,
      action: 'complete',
      description: 'Reduction complete'
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

  const isReduced = iterations < maxIterations

  return {
    reducedBasis,
    iterations,
    solutionVector: shortestVector,
    success: isReduced && !hasZeroVector,
    steps: captureSteps ? steps : undefined
  }
}

export function findShortVector(reducedBasis: number[][]): number[] {
  return reducedBasis.reduce((shortest, vec) => {
    const currentNorm = vectorNorm(vec)
    const shortestNorm = vectorNorm(shortest)
    return currentNorm < shortestNorm ? vec : shortest
  }, reducedBasis[0])
}

export function validateBasis(basis: number[][]): { valid: boolean; error?: string } {
  if (basis.length === 0) {
    return { valid: false, error: 'Basis cannot be empty' }
  }

  const cols = basis[0].length
  if (basis.some(row => row.length !== cols)) {
    return { valid: false, error: 'All rows must have the same length' }
  }

  if (basis.some(row => row.some(val => !isFinite(val)))) {
    return { valid: false, error: 'All values must be finite numbers' }
  }

  return { valid: true }
}

export function parseBasisFromString(input: string): number[][] | null {
  try {
    const lines = input.trim().split('\n').filter(line => line.trim())
    const basis = lines.map(line => {
      const values = line.trim().split(/[\s,]+/).map(val => {
        const num = parseFloat(val)
        if (!isFinite(num)) throw new Error('Invalid number')
        return num
      })
      return values
    })

    const validation = validateBasis(basis)
    if (!validation.valid) return null

    return basis
  } catch {
    return null
  }
}

export function formatBasis(basis: number[][]): string {
  return basis.map(row => row.map(val => val.toString().padStart(8)).join(' ')).join('\n')
}
