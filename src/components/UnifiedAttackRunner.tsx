/**
 * UnifiedAttackRunner Component
 * 
 * Provides an intuitive workflow for running lattice attacks with:
 * - Automatic strategy selection
 * - Clear progress feedback
 * - Retry logic with different parameters
 * - Result interpretation
 */

import { useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Play, 
  Stop, 
  ArrowClockwise, 
  Lightning, 
  CheckCircle, 
  XCircle, 
  Info,
  CaretRight,
  Spinner
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { ParsedSignature } from '@/lib/dataParser'
import { 
  runAttackOrchestrator, 
  getAttackStrategySummary,
  OrchestratorResult,
  AttackProgress,
  AttackStrategy
} from '@/lib/attack-orchestrator'

interface UnifiedAttackRunnerProps {
  signatures: ParsedSignature[]
  targetAddress?: string
  onKeyFound?: (privateKeyHex: string, privateKeyWIF?: string) => void
}

const strategyLabels: Record<AttackStrategy, string> = {
  'nonce_reuse': '⚡ Nonce Reuse (Direct)',
  'hnp_standard': '📊 HNP Standard Lattice',
  'hnp_embedded': '🔗 HNP Embedded Lattice',
  'hnp_kannan': '🎯 HNP Kannan Embedding',
  'svp_direct': '📐 Direct SVP',
  'combined': '🔄 Combined Strategy'
}

const phaseColors: Record<string, string> = {
  'analyzing': 'bg-blue-500/20 border-blue-500/50 text-blue-400',
  'building_lattice': 'bg-purple-500/20 border-purple-500/50 text-purple-400',
  'reducing': 'bg-amber-500/20 border-amber-500/50 text-amber-400',
  'interpreting': 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400',
  'retrying': 'bg-orange-500/20 border-orange-500/50 text-orange-400',
  'complete': 'bg-green-500/20 border-green-500/50 text-green-400',
  'failed': 'bg-red-500/20 border-red-500/50 text-red-400'
}

export function UnifiedAttackRunner({ 
  signatures, 
  targetAddress: initialTargetAddress = '',
  onKeyFound 
}: UnifiedAttackRunnerProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<AttackProgress | null>(null)
  const [result, setResult] = useState<OrchestratorResult | null>(null)
  const [targetAddress, setTargetAddress] = useState(initialTargetAddress)
  const [summary, setSummary] = useState<ReturnType<typeof getAttackStrategySummary> | null>(null)

  // Analyze signatures when they change
  const handleAnalyze = useCallback(() => {
    if (signatures.length === 0) {
      toast.error('No signatures to analyze')
      return
    }
    
    const analysis = getAttackStrategySummary(signatures)
    setSummary(analysis)
    
    if (analysis.dimensionInfo.isValid) {
      toast.success('Analysis complete', {
        description: `Ready to attack with ${analysis.analysis.recommendedStrategy} strategy`
      })
    } else {
      toast.warning('Insufficient data', {
        description: analysis.dimensionInfo.insufficientDataReason
      })
    }
  }, [signatures])

  const handleRunAttack = useCallback(async () => {
    if (signatures.length === 0) {
      toast.error('No signatures loaded')
      return
    }

    setIsRunning(true)
    setResult(null)
    setProgress({
      phase: 'analyzing',
      message: 'Starting attack...',
      progress: 0
    })

    try {
      const attackResult = await runAttackOrchestrator(signatures, {
        targetAddress: targetAddress || undefined,
        maxAttempts: 5,
        enableRetry: true,
        usePrecision: true,
        onProgress: (p) => {
          setProgress(p)
        }
      })

      setResult(attackResult)

      if (attackResult.success && attackResult.privateKeyHex) {
        toast.success('🎉 VICTORY! Private key recovered!', {
          description: 'Key has been successfully extracted',
          duration: 10000
        })
        onKeyFound?.(attackResult.privateKeyHex, attackResult.privateKeyWIF)
      } else {
        toast.warning('Attack completed without finding key', {
          description: attackResult.recommendations?.[0] || 'Try with more signatures'
        })
      }
    } catch (error) {
      console.error('Attack error:', error)
      toast.error('Attack failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
      setProgress({
        phase: 'failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        progress: 100
      })
    } finally {
      setIsRunning(false)
    }
  }, [signatures, targetAddress, onKeyFound])

  const handleStop = useCallback(() => {
    // Stop tracking the attack progress - the actual computation will complete
    // but results won't be processed after stopping
    setIsRunning(false)
    setProgress({
      phase: 'failed',
      message: 'Attack stopped by user',
      progress: 0
    })
    toast.info('Attack tracking stopped', {
      description: 'Any running computation will complete in the background'
    })
  }, [])

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/20 rounded-lg border border-primary/30">
              <Lightning size={24} className="text-primary" weight="duotone" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Unified Attack Runner</h2>
              <p className="text-sm text-muted-foreground">
                Automatic strategy selection with retry logic
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-sm">
            {signatures.length} signatures loaded
          </Badge>
        </div>

        {/* Target Address Input */}
        <div className="mb-4">
          <Label htmlFor="target-addr" className="text-sm font-medium mb-2 block">
            Target Address (optional, for validation)
          </Label>
          <Input
            id="target-addr"
            value={targetAddress}
            onChange={(e) => setTargetAddress(e.target.value)}
            placeholder="e.g., 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa or 0x..."
            className="font-mono text-xs"
            disabled={isRunning}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleAnalyze}
            disabled={isRunning || signatures.length === 0}
            className="border-primary/30 hover:bg-primary/10"
          >
            <Info size={18} weight="duotone" />
            Analyze
          </Button>
          
          {!isRunning ? (
            <Button
              onClick={handleRunAttack}
              disabled={signatures.length === 0}
              className="flex-1 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
            >
              <Play size={20} weight="fill" />
              Run Attack
            </Button>
          ) : (
            <Button
              onClick={handleStop}
              variant="destructive"
              className="flex-1"
            >
              <Stop size={20} weight="fill" />
              Stop Attack
            </Button>
          )}
        </div>
      </Card>

      {/* Analysis Summary */}
      {summary && !result && (
        <Card className="p-4 bg-card/80 border-border/60">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <CaretRight size={16} weight="bold" className="text-primary" />
            Attack Strategy Analysis
          </h3>
          
          <div className="space-y-2">
            {summary.recommendations.map((rec, i) => (
              <Alert key={i} className={`py-2 ${
                rec.startsWith('⚡') ? 'border-success/50 bg-success/10' :
                rec.startsWith('⚠️') ? 'border-warning/50 bg-warning/10' :
                rec.startsWith('✓') ? 'border-primary/50 bg-primary/10' :
                'border-border/50 bg-secondary/50'
              }`}>
                <AlertDescription className="text-xs">
                  {rec}
                </AlertDescription>
              </Alert>
            ))}
          </div>

          {summary.analysis.hasNonceReuse && summary.analysis.nonceReusePairs.length > 0 && (
            <Alert className="mt-3 border-success/50 bg-success/10">
              <AlertDescription className="text-xs font-bold text-success">
                🔓 {summary.analysis.nonceReusePairs.length} nonce reuse pair(s) detected! 
                Direct key recovery possible.
              </AlertDescription>
            </Alert>
          )}
        </Card>
      )}

      {/* Progress Display */}
      {progress && (
        <Card className={`p-4 border-2 ${phaseColors[progress.phase] || 'bg-card/80 border-border/60'}`}>
          <div className="flex items-center gap-3 mb-3">
            {isRunning ? (
              <Spinner size={20} className="animate-spin" weight="bold" />
            ) : progress.phase === 'complete' ? (
              <CheckCircle size={20} weight="fill" className="text-green-400" />
            ) : progress.phase === 'failed' ? (
              <XCircle size={20} weight="fill" className="text-red-400" />
            ) : null}
            
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{progress.message}</span>
                {progress.currentStrategy && (
                  <Badge variant="outline" className="text-xs">
                    {strategyLabels[progress.currentStrategy] || progress.currentStrategy}
                  </Badge>
                )}
              </div>
              
              {progress.attemptNumber && progress.totalAttempts && (
                <div className="text-xs text-muted-foreground">
                  Attempt {progress.attemptNumber} of {progress.totalAttempts}
                </div>
              )}
            </div>
          </div>
          
          <Progress value={progress.progress} className="h-2" />
        </Card>
      )}

      {/* Result Display */}
      {result && (
        <Card className={`p-6 border-2 ${
          result.success 
            ? 'bg-gradient-to-br from-success/20 to-accent/20 border-success/60' 
            : 'bg-card/80 border-border/60'
        }`}>
          <div className="flex items-center gap-3 mb-4">
            {result.success ? (
              <div className="p-3 bg-success/20 rounded-full">
                <CheckCircle size={32} weight="fill" className="text-success" />
              </div>
            ) : (
              <div className="p-3 bg-muted/30 rounded-full">
                <XCircle size={32} weight="duotone" className="text-muted-foreground" />
              </div>
            )}
            
            <div>
              <h3 className="text-xl font-bold">
                {result.success ? '🎉 Key Found!' : 'Key Not Found'}
              </h3>
              <p className="text-sm text-muted-foreground">
                Strategy: {strategyLabels[result.strategy] || result.strategy}
                {' • '}
                {result.attempts.length} attempt(s)
                {' • '}
                {Math.round(result.totalExecutionTimeMs)}ms
              </p>
            </div>
          </div>

          {result.success && result.privateKeyHex && (
            <>
              <Separator className="my-4" />
              
              <div className="space-y-4">
                <div className="p-4 bg-card/80 rounded-lg border border-success/30">
                  <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">
                    Private Key (Hex)
                  </div>
                  <div className="font-mono text-sm break-all text-success">
                    {result.privateKeyHex}
                  </div>
                </div>

                {result.privateKeyWIF && (
                  <div className="p-4 bg-card/80 rounded-lg border border-success/30">
                    <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">
                      WIF (Wallet Import Format)
                    </div>
                    <div className="font-mono text-sm break-all text-success">
                      {result.privateKeyWIF}
                    </div>
                  </div>
                )}

                {result.derivedAddress && (
                  <div className="p-4 bg-secondary/50 rounded-lg border border-border/40">
                    <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">
                      Derived Address
                    </div>
                    <div className="font-mono text-sm break-all">
                      {result.derivedAddress}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {!result.success && result.recommendations && result.recommendations.length > 0 && (
            <>
              <Separator className="my-4" />
              
              <div>
                <h4 className="text-sm font-bold mb-2">Recommendations</h4>
                <ul className="space-y-2">
                  {result.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ArrowClockwise size={16} className="text-primary mt-0.5 flex-shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Attempt Details */}
          {result.attempts.length > 0 && (
            <>
              <Separator className="my-4" />
              
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                  View attempt details ({result.attempts.length} attempts)
                </summary>
                
                <div className="mt-3 space-y-2">
                  {result.attempts.map((attempt, i) => (
                    <div 
                      key={i} 
                      className={`p-3 rounded-lg border ${
                        attempt.success 
                          ? 'bg-success/10 border-success/30' 
                          : 'bg-secondary/30 border-border/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          #{i + 1}: {attempt.configuration.strategy}
                        </span>
                        <Badge variant={attempt.success ? 'default' : 'secondary'}>
                          {attempt.success ? 'Success' : 'Failed'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {attempt.configuration.algorithm.toUpperCase()}
                        {attempt.configuration.blockSize > 0 && `-${attempt.configuration.blockSize}`}
                        {' • '}
                        {Math.round(attempt.executionTimeMs)}ms
                        {attempt.failureReason && (
                          <span className="text-destructive"> • {attempt.failureReason}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
        </Card>
      )}

      {/* Empty State */}
      {!progress && !result && signatures.length === 0 && (
        <Card className="p-8 bg-card/80 border-border/60">
          <div className="text-center">
            <div className="inline-flex p-4 rounded-2xl bg-muted/30 mb-4">
              <Lightning size={48} className="text-muted-foreground/40" weight="duotone" />
            </div>
            <h3 className="text-lg font-bold mb-2">No Signatures Loaded</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Upload signature data in the Upload tab to begin analysis and attack.
              The orchestrator will automatically select the best strategy.
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
