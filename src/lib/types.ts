export type AttackType = 'rsa' | 'subset-sum' | 'knapsack' | 'cvp' | 'hnp' | 'ntru' | 'dsa' | 'custom'

export interface AttackConfig {
  id: string
  type: AttackType
  name: string
  basis: number[][]
  delta: number
  timestamp: number
}

export interface AttackResult {
  configId: string
  success: boolean
  reducedBasis: number[][]
  solutionVector?: number[]
  iterations: number
  executionTime: number
  timestamp: number
}

export interface AttackHistory {
  config: AttackConfig
  result: AttackResult
}

export interface AttackTemplate {
  id: string
  name: string
  description: string
  type: AttackType
  basis: number[][]
  delta: number
  expectedOutcome: string
}
