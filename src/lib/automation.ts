import { performBatchAnalysis, generateBatchAttackConfiguration, type BatchAnalysisResult, type SignatureCluster } from './batch-analysis'
import { generateAIPredictions, type MLPredictionResult } from './ml-predictor'
import { analyzeSignatures, type WeakSignature as AnalyzerWeakSignature, type AnalysisResult } from './signatureAnalyzer'
import { type ParsedSignature } from './dataParser'
import { runLLL } from './lll'
import { runBKZ } from './bkz'
import type { AttackHistory, AlgorithmType } from './types'

/**
 * Configuration for the automation engine.
 * NOTE: RPC scanning has been removed as it was redundant with ingested signature data.
 * Signatures should be provided via setSignatureData() from file uploads (Blockchair TSV, JSON, etc.)
 */
export interface AutomationConfig {
  /** @deprecated RPC URL is no longer used - signatures are ingested from files */
  rpcUrl?: string
  enableAutoScan: boolean
  scanInterval: number
  autoAnalyze: boolean
  autoAttack: boolean
  autoLearn: boolean
  maxConcurrentAttacks: number
  priorityThreshold: 'critical' | 'high' | 'medium' | 'low'
  scanBatchSize: number
  /** @deprecated Block scanning is no longer used - signatures are ingested from files */
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
  source: 'ingested-data' | 'batch-analysis' | 'ml-prediction' | 'manual'
  metadata: any
}

/**
 * Result of an analysis workflow on ingested signature data.
 * NOTE: scanResult is deprecated - use analysisResult instead
 */
export interface WorkflowResult {
  /** @deprecated Use analysisResult instead */
  scanResult?: {
    scanned: number
    weakSignatures: AnalyzerWeakSignature[]
    allSignatures: ParsedSignature[]
  }
  /** Analysis result from ingested signatures */
  analysisResult?: AnalysisResult
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
  private intervalId?: ReturnType<typeof setInterval>
  private onStateChange?: (state: AutomationState) => void
  private attackQueue: AttackQueueItem[] = []
  private runningAttacks: Set<string> = new Set()
  
  /**
   * Ingested signature data that will be analyzed.
   * Set via setSignatureData() from file uploads (Blockchair TSV, JSON, CSV, etc.)
   */
  private ingestedSignatures: ParsedSignature[] = []

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
  
  /**
   * Set the signature data to be analyzed.
   * This data should come from file uploads (Blockchair TSV, JSON, CSV, etc.)
   * rather than RPC scanning which was removed due to being unreliable in practice.
   */
  setSignatureData(signatures: ParsedSignature[]) {
    this.ingestedSignatures = signatures
    console.log(`[Automation] Loaded ${signatures.length} signatures for analysis`)
    this.addHistory('data-loaded', `Loaded ${signatures.length} signatures from ingested data`, true)
  }
  
  /**
   * Get the currently loaded signature count
   */
  getSignatureCount(): number {
    return this.ingestedSignatures.length
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
    
    const sigCount = this.ingestedSignatures.length
    if (sigCount === 0) {
      this.addHistory('start', 'Automation engine started - waiting for signature data to be loaded via file upload')
    } else {
      this.addHistory('start', `Automation engine started - ${sigCount} signatures loaded and ready for analysis`)
    }
    
    console.log('[Automation] Engine started')
    console.log('[Automation] Config:', {
      signatureCount: sigCount,
      autoAnalyze: this.config.autoAnalyze,
      autoAttack: this.config.autoAttack,
      autoLearn: this.config.autoLearn
    })

    if (this.config.enableAutoScan && sigCount > 0) {
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

  /**
   * Execute the full analysis workflow on ingested signature data.
   * NOTE: RPC scanning has been removed - use setSignatureData() to provide signatures.
   */
  async executeFullWorkflow(_customRange?: { from: number; to: number }): Promise<WorkflowResult> {
    const result: WorkflowResult = {
      attackResults: [],
      learnedPatterns: []
    }

    const signatures = this.ingestedSignatures
    const sigCount = signatures.length
    
    if (sigCount === 0) {
      console.log('[Automation] No signatures loaded - please upload signature data first')
      this.addHistory('no-data', 'No signature data loaded. Please upload Blockchair TSV, JSON, or CSV file with signatures.', false)
      return result
    }

    console.log(`[Automation] Starting workflow - analyzing ${sigCount} ingested signatures`)

    this.updateState({ currentPhase: 'analyzing', progress: 0 })
    
    try {
      console.log('[Automation] Analyzing ingested signatures...')
      
      // Use the signatureAnalyzer to find weaknesses
      result.analysisResult = analyzeSignatures(signatures)
      
      // Build scanResult-like structure for backward compatibility
      result.scanResult = {
        scanned: sigCount,
        weakSignatures: result.analysisResult.weakSignatures,
        allSignatures: signatures
      }

      console.log('[Automation] Analysis complete:', {
        analyzed: sigCount,
        weakSignatures: result.analysisResult.weakSignatures.length,
        patterns: result.analysisResult.patterns.length
      })

      this.updateState({
        totalScanned: this.state.totalScanned + sigCount,
        totalWeaknessesFound: this.state.totalWeaknessesFound + result.analysisResult.weakSignatures.length,
        progress: 25
      })

      const weaknessesByType: Record<string, number> = {}
      result.analysisResult.weakSignatures.forEach(sig => {
        weaknessesByType[sig.weakness] = (weaknessesByType[sig.weakness] || 0) + 1
      })

      this.addHistory('analysis-complete', `Analyzed ${sigCount} signatures: ${result.analysisResult.weakSignatures.length} weakness(es) found`, true, {
        weaknessesFound: result.analysisResult.weakSignatures.length,
        weaknessesByType
      })

      if (result.analysisResult.weakSignatures.length === 0 && result.analysisResult.patterns.length === 0) {
        console.log('[Automation] No weaknesses found in signatures')
        return result
      }

      console.log('[Automation] Found weaknesses, continuing to batch analysis phase...')

      // Perform batch analysis for pattern clustering
      if (this.config.autoAnalyze && sigCount > 1) {
        this.updateState({ currentPhase: 'analyzing', progress: 40 })
        
        result.batchAnalysis = performBatchAnalysis(signatures)
        
        const avgConfidence = result.batchAnalysis.clusters.length > 0
          ? result.batchAnalysis.clusters.reduce((sum, c) => sum + c.confidence, 0) / result.batchAnalysis.clusters.length
          : 0
        
        this.addHistory('batch-analysis-complete', `Found ${result.batchAnalysis.clusters.length} pattern clusters`, true, {
          patternsDetected: result.batchAnalysis.clusters.length,
          avgConfidence: Math.round(avgConfidence * 100) / 100
        })
      }

      // ML predictions (optional)
      if (this.config.autoAnalyze && result.batchAnalysis && sigCount >= 10) {
        this.updateState({ currentPhase: 'predicting', progress: 50 })
        
        try {
          // Use block numbers from signatures for prediction range
          const blockNumbers = signatures.map(s => s.blockNumber || 0).filter(b => b > 0)
          const maxBlock = blockNumbers.length > 0 ? Math.max(...blockNumbers) : 0
          
          if (maxBlock > 0) {
            result.mlPredictions = await generateAIPredictions(
              signatures,
              result.analysisResult.weakSignatures,
              result.batchAnalysis,
              { from: maxBlock + 1, to: maxBlock + 100 }
            )
            
            this.addHistory('predictions-generated', `Generated ${result.mlPredictions.predictions.length} predictions`)
          }
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
    // Queue attacks from analysis results
    if (result.analysisResult?.weakSignatures) {
      for (const weakSig of result.analysisResult.weakSignatures) {
        this.queueAttackFromWeakness(weakSig, 'ingested-data')
      }
    }
    // Also check scanResult for backward compatibility
    if (result.scanResult?.weakSignatures && !result.analysisResult) {
      for (const weakSig of result.scanResult.weakSignatures) {
        this.queueAttackFromWeakness(weakSig, 'ingested-data')
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

  private queueAttackFromWeakness(weakSig: AnalyzerWeakSignature, source: string) {
    const priorityMap = {
      'nonce-reuse': 100,
      'small-r': 90,
      'biased-k': 80,
      'similar-k': 70,
      'low-s': 50,
      'sequential-k': 85
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

  private generateBasisFromWeakness(weakSig: AnalyzerWeakSignature): number[][] | null {
    const sig = weakSig.signature
    
    if (weakSig.weakness === 'nonce-reuse' && weakSig.relatedSignatures && weakSig.relatedSignatures.length > 0) {
      // Nonce reuse attack: use r from both signatures
      const relatedSig = weakSig.relatedSignatures[0]
      const r = sig.r
      const s1 = sig.s
      const s2 = relatedSig.s
      
      // Scale down to fit in number range
      const scale = 1000000n
      return [
        [Number(r / scale % (2n ** 32n)), 0, 0],
        [Number(s1 / scale % (2n ** 32n)), 1, 0],
        [Number(s2 / scale % (2n ** 32n)), 0, 1]
      ]
    }

    if (weakSig.weakness === 'biased-k' || weakSig.weakness === 'similar-k') {
      const dim = 8
      const basis: number[][] = []
      const scale = 10n ** 60n
      
      for (let i = 0; i < dim; i++) {
        const row: number[] = []
        for (let j = 0; j < dim; j++) {
          if (i === j) {
            row.push(i === 0 ? 1 : 2 ** (8 + i))
          } else if (j === 0) {
            row.push(Number((sig.r / scale) % 1000n) + i * 100)
          } else {
            row.push(0)
          }
        }
        basis.push(row)
      }
      
      return basis
    }
    
    if (weakSig.weakness === 'small-r') {
      // Small r attack
      const scale = 1n
      return [
        [Number(sig.r / scale), 0],
        [Number(sig.s / scale % (2n ** 32n)), 1]
      ]
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
