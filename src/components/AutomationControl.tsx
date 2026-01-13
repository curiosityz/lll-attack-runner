import { useState, useEffect, useRef } from 'react'
import { useKV } from '@github/spark/hooks'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Play, 
  Stop, 
  Lightning, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Brain,
  Gauge,
  ListChecks,
  TrendUp
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { 
  AutomationEngine, 
  AutomationConfig, 
  AutomationState,
  LearnedPattern,
  AutomationHistory as AutomationHistoryType
} from '@/lib/automation'
import { AttackHistory } from '@/lib/types'
import { BlockProgressionChart } from '@/components/BlockProgressionChart'
import { WeaknessStats } from '@/components/WeaknessStats'
import { LiveMonitor } from '@/components/LiveMonitor'

interface AutomationControlProps {
  onAttackHistoryUpdate: (history: AttackHistory[]) => void
}

const DEFAULT_CONFIG: AutomationConfig = {
  rpcUrl: 'https://eth.llamarpc.com',
  enableAutoScan: false,
  scanInterval: 60000,
  autoAnalyze: true,
  autoAttack: true,
  autoLearn: true,
  maxConcurrentAttacks: 3,
  priorityThreshold: 'high',
  scanBatchSize: 10,
  startBlock: 21000000
}

export function AutomationControl({ onAttackHistoryUpdate }: AutomationControlProps) {
  const [config, setConfig] = useKV<AutomationConfig>('automation-config', DEFAULT_CONFIG)

  const [state, setState] = useState<AutomationState | null>(null)
  const [learnedPatterns, setLearnedPatterns] = useKV<LearnedPattern[]>('learned-patterns', [])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const engineRef = useRef<AutomationEngine | null>(null)
  const [isOneTimeRunning, setIsOneTimeRunning] = useState(false)

  useEffect(() => {
    const currentConfig = config || DEFAULT_CONFIG
    
    if (!engineRef.current) {
      engineRef.current = new AutomationEngine(currentConfig, (newState) => {
        setState(newState)
      })
    } else {
      engineRef.current.updateConfig(currentConfig)
    }
  }, [config])

  useEffect(() => {
    if (engineRef.current) {
      const updatedConfig = engineRef.current.getConfig()
      if (updatedConfig.startBlock !== config?.startBlock) {
        setConfig((c) => ({ ...(c || DEFAULT_CONFIG), startBlock: updatedConfig.startBlock }))
      }
    }
  }, [state?.totalScanned])

  const handleStart = () => {
    if (engineRef.current) {
      engineRef.current.start()
      toast.success('Automation engine started')
    }
  }

  const handleStop = () => {
    if (engineRef.current) {
      engineRef.current.stop()
      toast.success('Automation engine stopped')
    }
  }

  const handleRunOnce = async () => {
    if (!engineRef.current) return

    setIsOneTimeRunning(true)
    toast.info('Starting automated workflow...')

    try {
      const result = await engineRef.current.runAutomationCycle()
      
      if (result.attackResults.length > 0) {
        onAttackHistoryUpdate(result.attackResults)
      }

      if (result.learnedPatterns.length > 0) {
        setLearnedPatterns((current) => [...result.learnedPatterns, ...(current || [])])
      }

      toast.success(`Workflow complete! ${result.attackResults.length} attacks executed, ${result.learnedPatterns.length} patterns learned`)
    } catch (error) {
      toast.error(`Workflow failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsOneTimeRunning(false)
    }
  }

  const handleClearHistory = () => {
    if (engineRef.current) {
      engineRef.current.clearHistory()
      toast.success('Automation history cleared')
    }
  }

  const handleClearPatterns = () => {
    setLearnedPatterns([])
    toast.success('Learned patterns cleared')
  }

  const getPhaseIcon = (phase: AutomationState['currentPhase']) => {
    switch (phase) {
      case 'scanning': return <Gauge size={16} className="animate-spin" />
      case 'analyzing': return <Brain size={16} className="animate-pulse" />
      case 'predicting': return <TrendUp size={16} className="animate-pulse" />
      case 'attacking': return <Lightning size={16} className="animate-bounce" />
      case 'learning': return <Brain size={16} className="animate-pulse" />
      default: return <CheckCircle size={16} />
    }
  }

  const getPhaseColor = (phase: AutomationState['currentPhase']) => {
    switch (phase) {
      case 'scanning': return 'text-blue-400'
      case 'analyzing': return 'text-purple-400'
      case 'predicting': return 'text-cyan-400'
      case 'attacking': return 'text-accent'
      case 'learning': return 'text-green-400'
      default: return 'text-muted-foreground'
    }
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString()
  }

  return (
    <div className="space-y-6">
      <LiveMonitor 
        state={state} 
        startBlock={config?.startBlock} 
        scanBatchSize={config?.scanBatchSize}
      />

      <Card className="p-6 bg-card border-border">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Lightning size={24} className="text-accent" weight="fill" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Automation Engine</h2>
                {config?.enableAutoScan && state?.isRunning && (
                  <Badge variant="outline" className="text-xs bg-accent/10 text-accent border-accent/30">
                    Continuous Mode
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Automated scanning, analysis, and attack execution
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {state?.isRunning ? (
              <Button onClick={handleStop} variant="destructive" size="sm">
                <Stop size={16} weight="fill" />
                Stop
              </Button>
            ) : (
              <>
                <Button onClick={handleRunOnce} disabled={isOneTimeRunning} variant="outline" size="sm">
                  <Play size={16} weight="fill" />
                  Run Once
                </Button>
                <Button onClick={handleStart} size="sm">
                  <Play size={16} weight="fill" />
                  Start Auto
                </Button>
              </>
            )}
          </div>
        </div>

        {state?.isRunning && (
          <Alert className="mb-4 border-accent/30 bg-accent/5">
            <div className="flex items-center gap-3">
              <div className={getPhaseColor(state.currentPhase)}>
                {getPhaseIcon(state.currentPhase)}
              </div>
              <div className="flex-1">
                <AlertDescription>
                  <span className="font-medium capitalize">{state.currentPhase}</span> in progress
                  {state.currentPhase === 'scanning' && config?.startBlock && (
                    <span className="text-muted-foreground ml-2">
                      (Blocks {config.startBlock} - {config.startBlock + (config.scanBatchSize || 10)})
                    </span>
                  )}
                </AlertDescription>
              </div>
              <Progress value={state.progress} className="w-32" />
            </div>
          </Alert>
        )}

        {state?.lastError && (
          <Alert className="mb-4 border-destructive/30 bg-destructive/5">
            <XCircle size={16} className="text-destructive" />
            <AlertDescription className="text-xs">
              {state.lastError}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-secondary/20 border-border/50">
            <div className="text-xs text-muted-foreground mb-1">Blocks Scanned</div>
            <div className="text-2xl font-bold">{state?.totalScanned || 0}</div>
          </Card>
          <Card className="p-4 bg-secondary/20 border-border/50">
            <div className="text-xs text-muted-foreground mb-1">Weaknesses Found</div>
            <div className="text-2xl font-bold">{state?.totalWeaknessesFound || 0}</div>
          </Card>
          <Card className="p-4 bg-secondary/20 border-border/50">
            <div className="text-xs text-muted-foreground mb-1">Attacks Executed</div>
            <div className="text-2xl font-bold">{state?.totalAttacksExecuted || 0}</div>
          </Card>
          <Card className="p-4 bg-secondary/20 border-border/50">
            <div className="text-xs text-muted-foreground mb-1">Success Rate</div>
            <div className="text-2xl font-bold">
              {state?.totalAttacksExecuted 
                ? Math.round((state.successfulAttacks / state.totalAttacksExecuted) * 100)
                : 0}%
            </div>
          </Card>
        </div>

        {!state?.isRunning && config?.startBlock && (
          <Alert className="mb-4">
            <AlertDescription className="text-xs">
              <strong>Next scan range:</strong> Blocks {config.startBlock} - {config.startBlock + (config.scanBatchSize || 10) - 1}
            </AlertDescription>
          </Alert>
        )}

        <Separator className="my-6" />

        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rpc-url" className="text-sm font-medium mb-2 block">
                RPC Endpoint
              </Label>
              <Input
                id="rpc-url"
                value={config?.rpcUrl || DEFAULT_CONFIG.rpcUrl}
                onChange={(e) => setConfig((c) => ({ ...(c || DEFAULT_CONFIG), rpcUrl: e.target.value }))}
                placeholder="https://eth.llamarpc.com"
                disabled={state?.isRunning}
              />
            </div>

            <div>
              <Label htmlFor="start-block" className="text-sm font-medium mb-2 block">
                Start Block
              </Label>
              <Input
                id="start-block"
                type="number"
                value={config?.startBlock || DEFAULT_CONFIG.startBlock}
                onChange={(e) => setConfig((c) => ({ ...(c || DEFAULT_CONFIG), startBlock: parseInt(e.target.value) || 21000000 }))}
                disabled={state?.isRunning}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="scan-batch-size" className="text-sm font-medium mb-2 block">
                Blocks Per Scan
              </Label>
              <Input
                id="scan-batch-size"
                type="number"
                min="1"
                max="1000"
                value={config?.scanBatchSize || DEFAULT_CONFIG.scanBatchSize}
                onChange={(e) => setConfig((c) => ({ ...(c || DEFAULT_CONFIG), scanBatchSize: parseInt(e.target.value) || 10 }))}
                disabled={state?.isRunning}
              />
            </div>

            <div>
              <Label htmlFor="scan-interval" className="text-sm font-medium mb-2 block">
                Auto-Scan Interval (ms)
              </Label>
              <Input
                id="scan-interval"
                type="number"
                min="10000"
                step="10000"
                value={config?.scanInterval || DEFAULT_CONFIG.scanInterval}
                onChange={(e) => setConfig((c) => ({ ...(c || DEFAULT_CONFIG), scanInterval: parseInt(e.target.value) || 60000 }))}
                disabled={state?.isRunning}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="enable-auto-scan" className="text-sm font-medium cursor-pointer">
                  Enable Continuous Scanning
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically scan new blocks at regular intervals
                </p>
              </div>
              <Switch
                id="enable-auto-scan"
                checked={config?.enableAutoScan ?? DEFAULT_CONFIG.enableAutoScan}
                onCheckedChange={(checked) => setConfig((c) => ({ ...(c || DEFAULT_CONFIG), enableAutoScan: checked }))}
                disabled={state?.isRunning}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Label htmlFor="auto-analyze" className="text-sm font-medium cursor-pointer">
                Auto Batch Analysis
              </Label>
              <Switch
                id="auto-analyze"
                checked={config?.autoAnalyze ?? DEFAULT_CONFIG.autoAnalyze}
                onCheckedChange={(checked) => setConfig((c) => ({ ...(c || DEFAULT_CONFIG), autoAnalyze: checked }))}
                disabled={state?.isRunning}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="auto-attack" className="text-sm font-medium cursor-pointer">
                Auto Execute Attacks
              </Label>
              <Switch
                id="auto-attack"
                checked={config?.autoAttack ?? DEFAULT_CONFIG.autoAttack}
                onCheckedChange={(checked) => setConfig((c) => ({ ...(c || DEFAULT_CONFIG), autoAttack: checked }))}
                disabled={state?.isRunning}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="auto-learn" className="text-sm font-medium cursor-pointer">
                Auto Learn Patterns
              </Label>
              <Switch
                id="auto-learn"
                checked={config?.autoLearn || false}
                onCheckedChange={(checked) => setConfig((c) => ({ ...c!, autoLearn: checked }))}
                disabled={state?.isRunning}
              />
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full"
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
          </Button>

          {showAdvanced && (
            <>
              <Separator />
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="priority-threshold" className="text-sm font-medium mb-2 block">
                    Minimum Priority to Attack
                  </Label>
                  <Select
                    value={config?.priorityThreshold || DEFAULT_CONFIG.priorityThreshold}
                    onValueChange={(v) => setConfig((c) => ({ ...(c || DEFAULT_CONFIG), priorityThreshold: v as any }))}
                  >
                    <SelectTrigger id="priority-threshold" disabled={state?.isRunning}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical Only</SelectItem>
                      <SelectItem value="high">High & Above</SelectItem>
                      <SelectItem value="medium">Medium & Above</SelectItem>
                      <SelectItem value="low">All Priorities</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="max-concurrent" className="text-sm font-medium mb-2 block">
                    Max Concurrent Attacks
                  </Label>
                  <Input
                    id="max-concurrent"
                    type="number"
                    min="1"
                    max="10"
                    value={config?.maxConcurrentAttacks || DEFAULT_CONFIG.maxConcurrentAttacks}
                    onChange={(e) => setConfig((c) => ({ ...(c || DEFAULT_CONFIG), maxConcurrentAttacks: parseInt(e.target.value) || 3 }))}
                    disabled={state?.isRunning}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <BlockProgressionChart history={state?.history || []} />
        <WeaknessStats history={state?.history || []} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ListChecks size={20} className="text-accent" />
              <h3 className="text-sm font-semibold">Activity History</h3>
            </div>
            {state?.history && state.history.length > 0 && (
              <Button onClick={handleClearHistory} variant="ghost" size="sm">
                Clear
              </Button>
            )}
          </div>

          <ScrollArea className="h-[400px]">
            {!state?.history || state.history.length === 0 ? (
              <div className="text-center py-12">
                <Clock size={48} className="mx-auto mb-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No automation activity yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {state.history.map((entry, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-secondary/20 rounded border border-border/50 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        {entry.success ? (
                          <CheckCircle size={14} className="text-success flex-shrink-0" weight="fill" />
                        ) : (
                          <XCircle size={14} className="text-destructive flex-shrink-0" weight="fill" />
                        )}
                        <span className="font-medium">{entry.action}</span>
                      </div>
                      <span className="text-muted-foreground text-[10px]">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{entry.details}</p>
                    {entry.blocksScanned && (
                      <div className="mt-2 pt-2 border-t border-border/30">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
                          <span className="font-mono">
                            Blocks: {entry.blocksScanned.from.toLocaleString()} - {entry.blocksScanned.to.toLocaleString()}
                          </span>
                          <span className="text-accent">
                            ({(entry.blocksScanned.to - entry.blocksScanned.from + 1).toLocaleString()} blocks)
                          </span>
                        </div>
                        {entry.weaknessesFound !== undefined && entry.weaknessesFound > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                              {entry.weaknessesFound} weakness{entry.weaknessesFound !== 1 ? 'es' : ''}
                            </Badge>
                            {entry.weaknessesByType && Object.entries(entry.weaknessesByType).map(([type, count]) => (
                              <Badge key={type} variant="outline" className="text-[9px] bg-secondary/50 border-border/50">
                                {type}: {count}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {entry.patternsDetected !== undefined && entry.patternsDetected > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/30">
                          {entry.patternsDetected} pattern{entry.patternsDetected !== 1 ? 's' : ''}
                        </Badge>
                        {entry.avgConfidence !== undefined && (
                          <span className="text-[10px] text-muted-foreground">
                            Avg confidence: {(entry.avgConfidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    )}
                    {entry.attacksExecuted !== undefined && entry.attacksExecuted > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/30">
                          {entry.attacksExecuted} attack{entry.attacksExecuted !== 1 ? 's' : ''}
                        </Badge>
                        {entry.successfulAttacks !== undefined && (
                          <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">
                            {entry.successfulAttacks} succeeded
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>

        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Brain size={20} className="text-accent" />
              <h3 className="text-sm font-semibold">Learned Patterns</h3>
            </div>
            {learnedPatterns && learnedPatterns.length > 0 && (
              <Button onClick={handleClearPatterns} variant="ghost" size="sm">
                Clear
              </Button>
            )}
          </div>

          <ScrollArea className="h-[400px]">
            {!learnedPatterns || learnedPatterns.length === 0 ? (
              <div className="text-center py-12">
                <Brain size={48} className="mx-auto mb-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No patterns learned yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Enable auto-learning and run attacks to discover optimal configurations
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {learnedPatterns.map((pattern) => (
                  <div
                    key={pattern.id}
                    className="p-3 bg-secondary/20 rounded border border-border/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{pattern.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {Math.round(pattern.successRate * 100)}% success
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Avg Time:</span>{' '}
                        <span className="font-mono">{Math.round(pattern.avgExecutionTime)}ms</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Algorithm:</span>{' '}
                        <span className="font-mono uppercase">{pattern.optimalAlgorithm}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Delta:</span>{' '}
                        <span className="font-mono">{pattern.optimalDelta.toFixed(2)}</span>
                      </div>
                      {pattern.optimalBlockSize && (
                        <div>
                          <span className="text-muted-foreground">Block Size:</span>{' '}
                          <span className="font-mono">{pattern.optimalBlockSize}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-2 text-xs text-muted-foreground">
                      Matrix: {pattern.features.matrixSize}×{pattern.features.matrixSize} | 
                      Orthogonality: {(pattern.features.orthogonality * 100).toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>
    </div>
  )
}
