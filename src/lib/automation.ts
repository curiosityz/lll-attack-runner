import { scanRPCForWeakSignatures, type ScanResult } from './rpc-scanner'
import { performBatchAnalysis, generateBatchAttackConfiguration, type BatchAnalysisResult, type SignatureCluster } from './batch-analysis'
import { generateAIPredictions, type MLPredictionResult } from './ml-predictor'
import { runLLL } from './lll'
import { runBKZ } from './bkz'
import type { AttackHistory, AlgorithmType } from './types'

export interface AutomationConfig {
  rpcUrl: string
  enableAutoScan: boolean
  scanInterval: number
  autoAnalyze: boolean
  autoAttack: boolean
  autoLearn: boolean
  maxConcurrentAttacks: number
  priorityThreshold: 'critical' | 'high' | 'medium' | 'low'
  scanBatchSize: number
  startBlock?: number
}

export interface AutomationState {
  isRunning: boolean
  currentPhase: 'idle' | 'scanning' | 'analyzing' | 'predicting' | 'attacking' | 'learning'
  progress: number
  totalScanned: number
  totalWeaknessesFound: number
  totalAttacksExecuted: number
  successfulAttacks: number
  queue: AutomationTask[]
  history: AutomationHistory[]
  lastError?: string
}

export interface AutomationTask {
  id: string
  type: 'scan' | 'analyze' | 'predict' | 'attack'
  priority: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  data: any
  createdAt: number
  startedAt?: number
  completedAt?: number
  result?: any
  error?: string
}

export interface AutomationHistory {
  timestamp: number
  action: string
  blocksScanned?: { from: number; to: number }
  weaknessesFound?: number
  weaknessesByType?: Record<string, number>
  attacksExecuted?: number
  successfulAttacks?: number
  patternsDetected?: number
  avgConfidence?: number
  success: boolean
  details: string
}

export interface AttackQueueItem {
  id: string
  name: string
  basis: number[][]
  delta: number
  algorithm: AlgorithmType
  blockSize?: number
  priority: number
  source: 'rpc-scan' | 'batch-analysis' | 'ml-prediction' | 'manual'
  metadata: any
}

export interface WorkflowResult {
  scanResult?: ScanResult
  batchAnalysis?: BatchAnalysisResult
  mlPredictions?: MLPredictionResult
  attackResults: AttackHistory[]
  learnedPatterns: LearnedPattern[]
}

export interface LearnedPattern {
  id: string
  name: string
  successRate: number
  avgExecutionTime: number
  optimalDelta: number
  optimalAlgorithm: AlgorithmType
  optimalBlockSize?: number
  basis: number[][]
  features: {
    matrixSize: number
    avgVectorLength: number
    orthogonality: number
  }
  timestamp: number
}

export class AutomationEngine {
  private config: AutomationConfig
  private state: AutomationState
  private intervalId?: NodeJS.Timeout
  private onStateChange?: (state: AutomationState) => void
  private attackQueue: AttackQueueItem[] = []
  private runningAttacks: Set<string> = new Set()

  constructor(config: AutomationConfig, onStateChange?: (state: AutomationState) => void) {
    this.config = config
    this.onStateChange = onStateChange
    this.state = {
      isRunning: false,
      currentPhase: 'idle',
      progress: 0,
      totalScanned: 0,
      totalWeaknessesFound: 0,
      totalAttacksExecuted: 0,
      successfulAttacks: 0,
      queue: [],
      history: []
    }
  }

  private updateState(updates: Partial<AutomationState>) {
    this.state = { ...this.state, ...updates }
    this.onStateChange?.(this.state)
  }

  private addHistory(action: string, details: string, success: boolean = true, extra?: any) {
    const history: AutomationHistory = {
      timestamp: Date.now(),
      action,
      details,
      success,
      ...extra
    }
    this.state.history.unshift(history)
    if (this.state.history.length > 100) {
      this.state.history = this.state.history.slice(0, 100)
    }
    this.updateState({ history: this.state.history })
  }

  async start() {
    if (this.state.isRunning) return

    this.updateState({ isRunning: true, lastError: undefined })
    this.addHistory('start', `Automation engine started - will scan blocks starting from ${this.config.startBlock || 21000000}`)
    
    console.log('[Automation] Engine started')
    console.log('[Automation] Config:', {
      rpcUrl: this.config.rpcUrl,
      startBlock: this.config.startBlock,
      scanBatchSize: this.config.scanBatchSize,
      autoAnalyze: this.config.autoAnalyze,
      autoAttack: this.config.autoAttack,
      autoLearn: this.config.autoLearn
    })

    if (this.config.enableAutoScan) {
      this.scheduleNextScan()
    }
  }

  stop() {
    if (this.intervalId) {
      clearTimeout(this.intervalId)
      this.intervalId = undefined
    }
    this.updateState({ isRunning: false, currentPhase: 'idle' })
    this.addHistory('stop', 'Automation engine stopped')
  }

  private scheduleNextScan() {
    if (!this.state.isRunning) return

    this.intervalId = setTimeout(() => {
      this.runAutomationCycle().then(() => {
        if (this.state.isRunning) {
          this.scheduleNextScan()
        }
      })
    }, this.config.scanInterval)
  }

  async runAutomationCycle() {
    try {
      const result = await this.executeFullWorkflow()
      
      this.updateState({ lastError: undefined, currentPhase: 'idle' })
      
      this.addHistory(
        'cycle-complete',
        `Cycle completed: ${result.attackResults.length} attacks executed, ${result.learnedPatterns.length} patterns learned`,
        true,
        {
          attacksExecuted: result.attackResults.length,
          successfulAttacks: result.attackResults.filter(r => r.result.success).length,
          weaknessesFound: result.scanResult?.weakSignatures.length || 0
        }
      )

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.updateState({ lastError: errorMsg, currentPhase: 'idle' })
      this.addHistory('cycle-failed', `Automation cycle failed: ${errorMsg}`, false)
      
      console.error('[Automation] Cycle failed:', errorMsg)
      
      return {
        attackResults: [],
        learnedPatterns: []
      }
    }
  }

  async executeFullWorkflow(customRange?: { from: number; to: number }): Promise<WorkflowResult> {
    const result: WorkflowResult = {
      attackResults: [],
      learnedPatterns: []
    }

    let currentBlock = customRange?.from || this.config.startBlock || 21000000
    const endBlock = customRange?.to || currentBlock + this.config.scanBatchSize

    console.log(`[Automation] Starting workflow - scanning blocks ${currentBlock} to ${endBlock}`)

    this.updateState({ currentPhase: 'scanning', progress: 0 })
    
    try {
      console.log('[Automation] Calling scanRPCForWeakSignatures...')
      result.scanResult = await scanRPCForWeakSignatures(
        this.config.rpcUrl,
        currentBlock,
        endBlock,
        (current, total) => {
          this.updateState({ progress: (current / total) * 25 })
        }
      )

      console.log('[Automation] Scan complete:', {
        scanned: result.scanResult.scanned,
        weakSignatures: result.scanResult.weakSignatures.length,
        allSignatures: result.scanResult.allSignatures.length
      })

      this.updateState({
        totalScanned: this.state.totalScanned + result.scanResult.scanned,
        totalWeaknessesFound: this.state.totalWeaknessesFound + result.scanResult.weakSignatures.length
      })

      if (!customRange) {
        this.config.startBlock = endBlock + 1
        console.log('[Automation] Updated startBlock to:', this.config.startBlock)
      }

      const weaknessesByType: Record<string, number> = {}
      result.scanResult.weakSignatures.forEach(sig => {
        weaknessesByType[sig.weakness] = (weaknessesByType[sig.weakness] || 0) + 1
      })

      this.addHistory('scan-complete', `Scanned blocks ${currentBlock}-${endBlock}: ${result.scanResult.weakSignatures.length} weakness(es) found`, true, {
        blocksScanned: { from: currentBlock, to: endBlock },
        weaknessesFound: result.scanResult.weakSignatures.length,
        weaknessesByType
      })

      if (result.scanResult.weakSignatures.length === 0) {
        console.log('[Automation] No weaknesses found, ending workflow')
        return result
      }

      console.log('[Automation] Found weaknesses, continuing to analysis phase...')

      if (this.config.autoAnalyze && result.scanResult.allSignatures.length > 1) {
        this.updateState({ currentPhase: 'analyzing', progress: 25 })
        
        result.batchAnalysis = performBatchAnalysis(result.scanResult.allSignatures)
        
        const avgConfidence = result.batchAnalysis.clusters.length > 0
          ? result.batchAnalysis.clusters.reduce((sum, c) => sum + c.confidence, 0) / result.batchAnalysis.clusters.length
          : 0
        
        this.addHistory('analysis-complete', `Found ${result.batchAnalysis.clusters.length} pattern clusters`, true, {
          patternsDetected: result.batchAnalysis.clusters.length,
          avgConfidence: Math.round(avgConfidence * 100) / 100
        })
      }

      if (this.config.autoAnalyze && result.batchAnalysis) {
        this.updateState({ currentPhase: 'predicting', progress: 50 })
        
        try {
          result.mlPredictions = await generateAIPredictions(
            result.scanResult.allSignatures,
            result.scanResult.weakSignatures,
            result.batchAnalysis,
            { from: endBlock + 1, to: endBlock + this.config.scanBatchSize }
          )
          
          this.addHistory('predictions-generated', `Generated ${result.mlPredictions.predictions.length} block predictions`)
        } catch (error) {
          console.warn('ML prediction failed, continuing without predictions:', error)
        }
      }

      if (this.config.autoAttack) {
        this.updateState({ currentPhase: 'attacking', progress: 60 })
        
        this.queueAttacksFromResults(result)
        
        result.attackResults = await this.executeAttackQueue()
        
        const successCount = result.attackResults.filter(r => r.result.success).length
        
        this.updateState({
          totalAttacksExecuted: this.state.totalAttacksExecuted + result.attackResults.length,
          successfulAttacks: this.state.successfulAttacks + successCount
        })
        
        this.addHistory('attacks-executed', `Executed ${result.attackResults.length} attacks`, true, {
          attacksExecuted: result.attackResults.length,
          successfulAttacks: successCount
        })
      }

      if (this.config.autoLearn && result.attackResults.length > 0) {
        this.updateState({ currentPhase: 'learning', progress: 90 })
        
        result.learnedPatterns = this.learnFromResults(result.attackResults)
        
        this.addHistory('learning-complete', `Learned ${result.learnedPatterns.length} new patterns`)
      }

      this.updateState({ currentPhase: 'idle', progress: 100 })
      
      console.log('[Automation] Workflow complete')
      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Automation] Workflow error:', errorMsg, error)
      this.updateState({ currentPhase: 'idle', lastError: errorMsg })
      this.addHistory('workflow-error', `Workflow failed: ${errorMsg}`, false)
      throw error
    }
  }

  private queueAttacksFromResults(result: WorkflowResult) {
    if (result.scanResult?.weakSignatures) {
      for (const weakSig of result.scanResult.weakSignatures) {
        this.queueAttackFromWeakness(weakSig, 'rpc-scan')
      }
    }

    if (result.batchAnalysis?.clusters) {
      for (const cluster of result.batchAnalysis.clusters) {
        if (this.shouldQueueCluster(cluster)) {
          this.queueAttackFromCluster(cluster)
        }
      }
    }

    this.attackQueue.sort((a, b) => b.priority - a.priority)
  }

  private shouldQueueCluster(cluster: SignatureCluster): boolean {
    const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 }
    const configThreshold = priorityMap[this.config.priorityThreshold]
    
    const clusterSize = cluster.signatures.length
    let clusterPriority = 1
    if (clusterSize >= 10) clusterPriority = 4
    else if (clusterSize >= 5) clusterPriority = 3
    else if (clusterSize >= 3) clusterPriority = 2

    return clusterPriority >= configThreshold
  }

  private queueAttackFromWeakness(weakSig: any, source: string) {
    const priorityMap = {
      'nonce-reuse': 100,
      'small-r': 90,
      'biased-nonce': 80,
      'similar-k': 70,
      'high-s': 50
    }

    const basis = this.generateBasisFromWeakness(weakSig)
    if (!basis) return

    const attack: AttackQueueItem = {
      id: `attack-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `${weakSig.weakness.toUpperCase()} Attack`,
      basis,
      delta: 0.75,
      algorithm: weakSig.weakness === 'nonce-reuse' ? 'lll' : 'bkz',
      blockSize: 15,
      priority: priorityMap[weakSig.weakness as keyof typeof priorityMap] || 50,
      source: source as any,
      metadata: weakSig
    }

    this.attackQueue.push(attack)
  }

  private queueAttackFromCluster(cluster: SignatureCluster) {
    const config = generateBatchAttackConfiguration(cluster)
    if (!config) return

    const attack: AttackQueueItem = {
      id: `attack-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `${cluster.pattern.toUpperCase()} Batch Attack`,
      basis: config.basis,
      delta: config.delta,
      algorithm: config.algorithm || 'bkz',
      blockSize: config.blockSize || 15,
      priority: 60 + cluster.signatures.length,
      source: 'batch-analysis',
      metadata: cluster
    }

    this.attackQueue.push(attack)
  }

  private generateBasisFromWeakness(weakSig: any): number[][] | null {
    if (weakSig.weakness === 'nonce-reuse') {
      const n = 2n ** 256n - 432420386565659656852420866394968145599n
      const r = BigInt(weakSig.r || '0x' + 'a'.repeat(64))
      
      return [
        [Number(n % (2n ** 32n)), Number((n >> 32n) % (2n ** 32n))],
        [Number(r % (2n ** 32n)), Number((r >> 32n) % (2n ** 32n))]
      ]
    }

    if (weakSig.weakness === 'biased-nonce') {
      const dim = 8
      const basis: number[][] = []
      
      for (let i = 0; i < dim; i++) {
        const row: number[] = []
        for (let j = 0; j < dim; j++) {
          if (i === j) {
            row.push(i === 0 ? 1 : 2 ** (8 + i))
          } else if (j === 0) {
            row.push(Math.floor(Math.random() * 1000) + 1)
          } else {
            row.push(0)
          }
        }
        basis.push(row)
      }
      
      return basis
    }

    return null
  }

  private async executeAttackQueue(): Promise<AttackHistory[]> {
    const results: AttackHistory[] = []
    const maxConcurrent = this.config.maxConcurrentAttacks
    
    while (this.attackQueue.length > 0) {
      const batch = this.attackQueue.splice(0, maxConcurrent)
      
      const batchResults = await Promise.all(
        batch.map(attack => this.executeAttack(attack))
      )
      
      results.push(...batchResults.filter(r => r !== null) as AttackHistory[])
    }
    
    return results
  }

  private async executeAttack(attack: AttackQueueItem): Promise<AttackHistory | null> {
    this.runningAttacks.add(attack.id)
    
    try {
      const startTime = performance.now()
      
      let result
      if (attack.algorithm === 'bkz') {
        result = runBKZ(attack.basis, attack.blockSize || 10, attack.delta, false)
      } else {
        result = runLLL(attack.basis, attack.delta, false)
      }
      
      const endTime = performance.now()
      const executionTime = Math.round(endTime - startTime)

      const history: AttackHistory = {
        config: {
          id: attack.id,
          type: 'custom',
          name: attack.name,
          basis: attack.basis,
          delta: attack.delta,
          timestamp: Date.now(),
          algorithm: attack.algorithm,
          blockSize: attack.blockSize
        },
        result: {
          configId: attack.id,
          success: result.success,
          reducedBasis: result.reducedBasis,
          solutionVector: result.solutionVector,
          iterations: result.iterations,
          executionTime,
          timestamp: Date.now(),
          algorithm: attack.algorithm,
          blockSize: attack.blockSize
        }
      }

      this.addHistory(
        'attack-executed',
        `${attack.name} ${result.success ? 'succeeded' : 'failed'} (${executionTime}ms)`,
        result.success
      )

      return history
    } catch (error) {
      this.addHistory('attack-failed', `${attack.name} execution error: ${error instanceof Error ? error.message : 'Unknown'}`, false)
      return null
    } finally {
      this.runningAttacks.delete(attack.id)
    }
  }

  private learnFromResults(attackResults: AttackHistory[]): LearnedPattern[] {
    const patterns: LearnedPattern[] = []
    
    const successfulAttacks = attackResults.filter(a => a.result.success)
    if (successfulAttacks.length === 0) return patterns

    const groupedBySize = new Map<number, AttackHistory[]>()
    for (const attack of successfulAttacks) {
      const size = attack.config.basis.length
      if (!groupedBySize.has(size)) {
        groupedBySize.set(size, [])
      }
      groupedBySize.get(size)!.push(attack)
    }

    for (const [size, attacks] of groupedBySize) {
      if (attacks.length < 2) continue

      const avgExecutionTime = attacks.reduce((sum, a) => sum + a.result.executionTime, 0) / attacks.length
      const optimalDelta = this.calculateOptimalDelta(attacks)
      const optimalAlgorithm = this.calculateOptimalAlgorithm(attacks)
      const optimalBlockSize = this.calculateOptimalBlockSize(attacks)

      const representativeAttack = attacks[0]
      
      const pattern: LearnedPattern = {
        id: `pattern-${Date.now()}-${size}`,
        name: `Learned Pattern (${size}x${size})`,
        successRate: 1.0,
        avgExecutionTime,
        optimalDelta,
        optimalAlgorithm,
        optimalBlockSize,
        basis: representativeAttack.config.basis,
        features: {
          matrixSize: size,
          avgVectorLength: this.calculateAvgVectorLength(representativeAttack.config.basis),
          orthogonality: this.calculateOrthogonality(representativeAttack.config.basis)
        },
        timestamp: Date.now()
      }

      patterns.push(pattern)
    }

    return patterns
  }

  private calculateOptimalDelta(attacks: AttackHistory[]): number {
    const deltas = attacks.map(a => a.config.delta)
    return deltas.reduce((sum, d) => sum + d, 0) / deltas.length
  }

  private calculateOptimalAlgorithm(attacks: AttackHistory[]): AlgorithmType {
    const lllCount = attacks.filter(a => a.config.algorithm === 'lll').length
    const bkzCount = attacks.filter(a => a.config.algorithm === 'bkz').length
    return bkzCount > lllCount ? 'bkz' : 'lll'
  }

  private calculateOptimalBlockSize(attacks: AttackHistory[]): number | undefined {
    const blockSizes = attacks
      .filter(a => a.config.blockSize !== undefined)
      .map(a => a.config.blockSize!)
    
    if (blockSizes.length === 0) return undefined
    
    return Math.round(blockSizes.reduce((sum, bs) => sum + bs, 0) / blockSizes.length)
  }

  private calculateAvgVectorLength(basis: number[][]): number {
    let totalLength = 0
    for (const vector of basis) {
      const length = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
      totalLength += length
    }
    return totalLength / basis.length
  }

  private calculateOrthogonality(basis: number[][]): number {
    if (basis.length < 2) return 1

    let totalDot = 0
    let count = 0
    
    for (let i = 0; i < basis.length; i++) {
      for (let j = i + 1; j < basis.length; j++) {
        const dot = basis[i].reduce((sum, val, idx) => sum + val * basis[j][idx], 0)
        const len1 = Math.sqrt(basis[i].reduce((sum, val) => sum + val * val, 0))
        const len2 = Math.sqrt(basis[j].reduce((sum, val) => sum + val * val, 0))
        
        if (len1 > 0 && len2 > 0) {
          totalDot += Math.abs(dot) / (len1 * len2)
          count++
        }
      }
    }
    
    return count > 0 ? 1 - (totalDot / count) : 1
  }

  getState(): AutomationState {
    return { ...this.state }
  }

  getConfig(): AutomationConfig {
    return { ...this.config }
  }

  updateConfig(updates: Partial<AutomationConfig>) {
    this.config = { ...this.config, ...updates }
  }

  clearHistory() {
    this.updateState({ history: [] })
  }
}
