export type AttackType = 'rsa' | 'subset-sum' | 'knapsack' | 'cvp' | 'hnp' | 'ntru' | 'dsa' | 'custom' | 'signature-scan'

export type AlgorithmType = 'lll' | 'bkz'

export interface AttackConfig {
  id: string
  type: AttackType
  name: string
  basis: number[][]
  delta: number
  timestamp: number
  algorithm?: AlgorithmType
  blockSize?: number
  rpcUrl?: string
  blockRange?: { from: number; to: number }
}

export interface AttackResult {
  configId: string
  success: boolean
  reducedBasis: number[][]
  solutionVector?: number[]
  iterations: number
  executionTime: number
  timestamp: number
  algorithm?: AlgorithmType
  blockSize?: number
  weaknessDetected?: string
  privateKey?: string
  privateKeyValid?: boolean
  derivedAddress?: string
  keyExtractionConfidence?: number
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

export interface LLLStep {
  iteration: number
  basis: number[][]
  k: number
  action: 'reduce' | 'swap' | 'complete'
  description: string
}
