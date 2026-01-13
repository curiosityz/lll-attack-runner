import { useState } from 'react'
import { useKV } from '@github/spark/hooks'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Play, 
  Stop, 
  CheckCircle, 
  XCircle, 
  Clock,
  ListChecks,
  Plus,
  Trash
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { AutomationEngine, AutomationConfig, type AutomationState } from '@/lib/automation'
import type { AttackHistory } from '@/lib/types'

interface BlockRange {
  id: string
  name: string
  startBlock: number
  endBlock: number
  blocksPerScan: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  scannedBlocks: number
  weaknessesFound: number
  attacksExecuted: number
  timeElapsed?: number
  error?: string
}

interface BlockRangeTesterProps {
  onAttackHistoryUpdate: (history: AttackHistory[]) => void
}

const PRESET_RANGES = [
  { name: 'Recent Blocks', start: 21000000, end: 21000100, batchSize: 10 },
  { name: 'Mid 2024', start: 20000000, end: 20000100, batchSize: 10 },
  { name: 'Early 2024', start: 19000000, end: 19000100, batchSize: 10 },
  { name: 'Late 2023', start: 18000000, end: 18000100, batchSize: 10 },
  { name: 'Mid 2023', start: 17000000, end: 17000100, batchSize: 10 },
]

export function BlockRangeTester({ onAttackHistoryUpdate }: BlockRangeTesterProps) {
  const [ranges, setRanges] = useKV<BlockRange[]>('block-range-tests', [])
  const [rpcUrl, setRpcUrl] = useKV<string>('range-tester-rpc', 'https://eth.llamarpc.com')
  const [newRangeName, setNewRangeName] = useState('')
  const [newStartBlock, setNewStartBlock] = useState('21000000')
  const [newEndBlock, setNewEndBlock] = useState('21000100')
  const [newBlocksPerScan, setNewBlocksPerScan] = useState('10')
  const [isRunning, setIsRunning] = useState(false)
  const [currentRangeId, setCurrentRangeId] = useState<string | null>(null)
  const [engineState, setEngineState] = useState<AutomationState | null>(null)

  const addRange = (name: string, start: number, end: number, batchSize: number) => {
    const newRange: BlockRange = {
      id: Date.now().toString(),
      name,
      startBlock: start,
      endBlock: end,
      blocksPerScan: batchSize,
      status: 'pending',
      progress: 0,
      scannedBlocks: 0,
      weaknessesFound: 0,
      attacksExecuted: 0
    }
    setRanges((current) => [...(current || []), newRange])
    toast.success(`Added range: ${name}`)
  }

  const addCustomRange = () => {
    const start = parseInt(newStartBlock)
    const end = parseInt(newEndBlock)
    const batchSize = parseInt(newBlocksPerScan)

    if (isNaN(start) || isNaN(end) || isNaN(batchSize)) {
      toast.error('Invalid block numbers')
      return
    }

    if (start >= end) {
      toast.error('Start block must be less than end block')
      return
    }

    if (batchSize < 1 || batchSize > 100) {
      toast.error('Blocks per scan must be between 1 and 100')
      return
    }

    const name = newRangeName.trim() || `Custom Range ${start}-${end}`
    addRange(name, start, end, batchSize)
    
    setNewRangeName('')
    setNewStartBlock('')
    setNewEndBlock('')
    setNewBlocksPerScan('10')
  }

  const removeRange = (id: string) => {
    setRanges((current) => (current || []).filter(r => r.id !== id))
    toast.success('Range removed')
  }

  const clearCompleted = () => {
    setRanges((current) => (current || []).filter(r => r.status !== 'completed'))
    toast.success('Completed ranges cleared')
  }

  const runAllRanges = async () => {
    const pendingRanges = (ranges || []).filter(r => r.status === 'pending' || r.status === 'failed')
    
    if (pendingRanges.length === 0) {
      toast.error('No pending ranges to run')
      return
    }

    setIsRunning(true)
    toast.info(`Starting continuous test of ${pendingRanges.length} ranges`)

    for (const range of pendingRanges) {
      if (!isRunning) break

      await runSingleRange(range)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    setIsRunning(false)
    setCurrentRangeId(null)
    toast.success('All ranges completed!')
  }

  const runSingleRange = async (range: BlockRange) => {
    setCurrentRangeId(range.id)
    
    setRanges((current) =>
      (current || []).map(r =>
        r.id === range.id
          ? { ...r, status: 'running' as const, progress: 0, error: undefined }
          : r
      )
    )

    const startTime = Date.now()
    let currentBlock = range.startBlock
    const totalBlocks = range.endBlock - range.startBlock
    let totalWeaknesses = 0
    let totalAttacks = 0

    try {
      while (currentBlock < range.endBlock) {
        const config: AutomationConfig = {
          rpcUrl: rpcUrl || 'https://eth.llamarpc.com',
          enableAutoScan: false,
          scanInterval: 0,
          autoAnalyze: true,
          autoAttack: true,
          autoLearn: true,
          maxConcurrentAttacks: 3,
          priorityThreshold: 'high',
          scanBatchSize: range.blocksPerScan,
          startBlock: currentBlock
        }

        const engine = new AutomationEngine(config, (state) => {
          setEngineState(state)
          
          const scannedSoFar = currentBlock - range.startBlock + state.totalScanned
          const progress = Math.min(100, (scannedSoFar / totalBlocks) * 100)
          
          setRanges((current) =>
            (current || []).map(r =>
              r.id === range.id
                ? {
                    ...r,
                    progress,
                    scannedBlocks: scannedSoFar,
                    weaknessesFound: state.totalWeaknessesFound,
                    attacksExecuted: state.totalAttacksExecuted
                  }
                : r
            )
          )
        })

        const result = await engine.runAutomationCycle()

        if (result.attackResults.length > 0) {
          onAttackHistoryUpdate(result.attackResults)
          totalAttacks += result.attackResults.length
        }

        totalWeaknesses += engineState?.totalWeaknessesFound || 0
        currentBlock += range.blocksPerScan

        await new Promise(resolve => setTimeout(resolve, 500))
      }

      const timeElapsed = Math.round((Date.now() - startTime) / 1000)

      setRanges((current) =>
        (current || []).map(r =>
          r.id === range.id
            ? {
                ...r,
                status: 'completed' as const,
                progress: 100,
                scannedBlocks: totalBlocks,
                timeElapsed,
                weaknessesFound: totalWeaknesses,
                attacksExecuted: totalAttacks
              }
            : r
        )
      )

      toast.success(`Completed: ${range.name} (${totalWeaknesses} weaknesses, ${totalAttacks} attacks)`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      
      setRanges((current) =>
        (current || []).map(r =>
          r.id === range.id
            ? { ...r, status: 'failed' as const, error: errorMsg }
            : r
        )
      )

      toast.error(`Range failed: ${range.name} - ${errorMsg}`)
      console.error(`[BlockRangeTester] Error in range ${range.name}:`, error)
    }
  }

  const stopAll = () => {
    setIsRunning(false)
    setCurrentRangeId(null)
    setRanges((current) =>
      (current || []).map(r =>
        r.status === 'running' ? { ...r, status: 'pending' as const } : r
      )
    )
    toast.info('Stopped all range tests')
  }

  const getStatusIcon = (status: BlockRange['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-green-400" weight="fill" />
      case 'failed':
        return <XCircle size={16} className="text-destructive" weight="fill" />
      case 'running':
        return <Clock size={16} className="text-accent animate-pulse" weight="fill" />
      default:
        return <Clock size={16} className="text-muted-foreground" />
    }
  }

  const getStatusBadge = (status: BlockRange['status']) => {
    const variants = {
      pending: 'secondary',
      running: 'default',
      completed: 'outline',
      failed: 'destructive'
    } as const

    return (
      <Badge variant={variants[status]} className="text-xs">
        {status}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ListChecks size={24} className="text-accent" weight="fill" />
            <div>
              <h2 className="text-lg font-semibold">Block Range Tester</h2>
              <p className="text-xs text-muted-foreground">
                Test continuous automation across multiple block ranges
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRunning ? (
              <Button onClick={stopAll} variant="destructive" size="sm">
                <Stop size={16} weight="fill" />
                Stop All
              </Button>
            ) : (
              <>
                {((ranges || []).filter(r => r.status === 'completed').length > 0) && (
                  <Button onClick={clearCompleted} variant="outline" size="sm">
                    <Trash size={16} />
                    Clear Completed
                  </Button>
                )}
                <Button 
                  onClick={runAllRanges} 
                  disabled={(ranges || []).filter(r => r.status === 'pending' || r.status === 'failed').length === 0}
                  size="sm"
                >
                  <Play size={16} weight="fill" />
                  Run All
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <Label htmlFor="rpc-url" className="text-sm font-medium mb-2 block">
              RPC Endpoint
            </Label>
            <Input
              id="rpc-url"
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              placeholder="https://eth.llamarpc.com"
              disabled={isRunning}
            />
          </div>

          <Separator />

          <div>
            <Label className="text-sm font-medium mb-3 block">Add Preset Ranges</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_RANGES.map((preset) => (
                <Button
                  key={preset.name}
                  variant="outline"
                  size="sm"
                  onClick={() => addRange(preset.name, preset.start, preset.end, preset.batchSize)}
                  disabled={isRunning}
                >
                  <Plus size={14} />
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <Label className="text-sm font-medium mb-3 block">Add Custom Range</Label>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <Input
                placeholder="Range Name"
                value={newRangeName}
                onChange={(e) => setNewRangeName(e.target.value)}
                disabled={isRunning}
              />
              <Input
                type="number"
                placeholder="Start Block"
                value={newStartBlock}
                onChange={(e) => setNewStartBlock(e.target.value)}
                disabled={isRunning}
              />
              <Input
                type="number"
                placeholder="End Block"
                value={newEndBlock}
                onChange={(e) => setNewEndBlock(e.target.value)}
                disabled={isRunning}
              />
              <Input
                type="number"
                placeholder="Batch Size"
                value={newBlocksPerScan}
                onChange={(e) => setNewBlocksPerScan(e.target.value)}
                disabled={isRunning}
              />
              <Button onClick={addCustomRange} disabled={isRunning} className="w-full">
                <Plus size={16} />
                Add
              </Button>
            </div>
          </div>
        </div>

        {engineState?.isRunning && engineState.currentPhase !== 'idle' && (
          <Alert className="mb-4 border-accent/30 bg-accent/5">
            <AlertDescription className="text-xs">
              <span className="font-medium capitalize">{engineState.currentPhase}</span> in progress
              {engineState.lastError && (
                <span className="text-destructive ml-2">- {engineState.lastError}</span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {(ranges || []).length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
            <ListChecks size={48} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold mb-2">No Ranges Added</h3>
            <p className="text-xs text-muted-foreground">
              Add preset or custom ranges to start testing
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-3 pr-4">
              {(ranges || []).map((range) => (
                <Card
                  key={range.id}
                  className={`p-4 border ${
                    currentRangeId === range.id
                      ? 'border-accent bg-accent/5'
                      : 'border-border bg-secondary/20'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(range.status)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{range.name}</span>
                          {getStatusBadge(range.status)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Blocks {range.startBlock.toLocaleString()} - {range.endBlock.toLocaleString()}
                          {' '}({(range.endBlock - range.startBlock).toLocaleString()} blocks, batch size: {range.blocksPerScan})
                        </div>
                      </div>
                    </div>
                    
                    {range.status !== 'running' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRange(range.id)}
                        disabled={isRunning}
                      >
                        <Trash size={14} />
                      </Button>
                    )}
                  </div>

                  {range.status === 'running' && (
                    <Progress value={range.progress} className="mb-3" />
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Scanned</div>
                      <div className="text-sm font-semibold">
                        {range.scannedBlocks.toLocaleString()} blocks
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Weaknesses</div>
                      <div className="text-sm font-semibold">{range.weaknessesFound}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Attacks</div>
                      <div className="text-sm font-semibold">{range.attacksExecuted}</div>
                    </div>
                    {range.timeElapsed !== undefined && (
                      <div>
                        <div className="text-xs text-muted-foreground">Time</div>
                        <div className="text-sm font-semibold">{range.timeElapsed}s</div>
                      </div>
                    )}
                  </div>

                  {range.error && (
                    <Alert className="mt-3 border-destructive/30 bg-destructive/5">
                      <XCircle size={14} className="text-destructive" />
                      <AlertDescription className="text-xs">{range.error}</AlertDescription>
                    </Alert>
                  )}
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>

      <Card className="p-6 bg-card border-border">
        <h3 className="text-sm font-semibold mb-3">Overall Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Total Ranges</div>
            <div className="text-2xl font-bold">{(ranges || []).length}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Completed</div>
            <div className="text-2xl font-bold text-green-400">
              {(ranges || []).filter(r => r.status === 'completed').length}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Failed</div>
            <div className="text-2xl font-bold text-destructive">
              {(ranges || []).filter(r => r.status === 'failed').length}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Total Weaknesses</div>
            <div className="text-2xl font-bold text-accent">
              {(ranges || []).reduce((sum, r) => sum + r.weaknessesFound, 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Total Attacks</div>
            <div className="text-2xl font-bold text-purple-400">
              {(ranges || []).reduce((sum, r) => sum + r.attacksExecuted, 0)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
