import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { 
  Cube, 
  Crosshair, 
  Timer,
  ArrowRight,
  Lightning
} from '@phosphor-icons/react'
import type { AutomationState } from '@/lib/automation'

interface LiveMonitorProps {
  state: AutomationState | null
  startBlock?: number
  scanBatchSize?: number
}

export function LiveMonitor({ state, startBlock, scanBatchSize = 10 }: LiveMonitorProps) {
  if (!state || !state.isRunning) {
    return null
  }

  const currentBlockRange = startBlock 
    ? `${startBlock.toLocaleString()} - ${(startBlock + scanBatchSize - 1).toLocaleString()}`
    : 'Unknown'

  const getPhaseColor = (phase: AutomationState['currentPhase']) => {
    switch (phase) {
      case 'scanning': return 'text-blue-400 bg-blue-500/10 border-blue-500/30'
      case 'analyzing': return 'text-purple-400 bg-purple-500/10 border-purple-500/30'
      case 'predicting': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
      case 'attacking': return 'text-accent bg-accent/10 border-accent/30'
      case 'learning': return 'text-green-400 bg-green-500/10 border-green-500/30'
      default: return 'text-muted-foreground bg-secondary/20 border-border/50'
    }
  }

  const getPhaseDescription = (phase: AutomationState['currentPhase']) => {
    switch (phase) {
      case 'scanning': return 'Fetching transaction data from blockchain RPC'
      case 'analyzing': return 'Running batch analysis to detect patterns'
      case 'predicting': return 'Using ML to predict high-risk blocks'
      case 'attacking': return 'Executing lattice reduction attacks'
      case 'learning': return 'Analyzing results to optimize parameters'
      default: return 'Workflow idle'
    }
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-accent/30">
      <div className="flex items-center gap-3 mb-4">
        <Lightning size={20} className="text-accent animate-pulse" weight="fill" />
        <h3 className="text-sm font-semibold">Live Monitoring</h3>
        <Badge variant="outline" className="ml-auto text-[10px] bg-accent/10 text-accent border-accent/30 animate-pulse">
          ACTIVE
        </Badge>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium">Current Phase</div>
            <Badge variant="outline" className={`text-[10px] ${getPhaseColor(state.currentPhase)}`}>
              {state.currentPhase.toUpperCase()}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <Progress value={state.progress} className="flex-1" />
            <span className="text-xs font-mono text-muted-foreground">
              {state.progress.toFixed(0)}%
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {getPhaseDescription(state.currentPhase)}
          </p>
        </div>

        <Separator />

        {state.currentPhase === 'scanning' && startBlock && (
          <div className="p-3 bg-blue-500/5 rounded border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Cube size={14} className="text-blue-400" />
              <span className="text-xs font-medium">Scanning Block Range</span>
            </div>
            <div className="font-mono text-xs text-blue-400">
              {currentBlockRange}
            </div>
            <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
              <span>{scanBatchSize} blocks</span>
              <ArrowRight size={10} />
              <span>Processing transactions...</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-secondary/20 rounded border border-border/50">
            <div className="flex items-center gap-2 mb-1">
              <Cube size={12} className="text-muted-foreground" />
              <div className="text-[10px] text-muted-foreground">Blocks Scanned</div>
            </div>
            <div className="text-lg font-bold">{state.totalScanned.toLocaleString()}</div>
          </div>

          <div className="p-3 bg-secondary/20 rounded border border-border/50">
            <div className="flex items-center gap-2 mb-1">
              <Crosshair size={12} className="text-destructive" />
              <div className="text-[10px] text-muted-foreground">Weaknesses</div>
            </div>
            <div className="text-lg font-bold text-destructive">{state.totalWeaknessesFound}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-secondary/20 rounded border border-border/50">
            <div className="flex items-center gap-2 mb-1">
              <Timer size={12} className="text-accent" />
              <div className="text-[10px] text-muted-foreground">Attacks Run</div>
            </div>
            <div className="text-lg font-bold text-accent">{state.totalAttacksExecuted}</div>
          </div>

          <div className="p-3 bg-secondary/20 rounded border border-border/50">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-[10px] text-muted-foreground">Success Rate</div>
            </div>
            <div className="text-lg font-bold text-success">
              {state.totalAttacksExecuted > 0
                ? `${Math.round((state.successfulAttacks / state.totalAttacksExecuted) * 100)}%`
                : '0%'}
            </div>
          </div>
        </div>

        {state.lastError && (
          <div className="p-3 bg-destructive/5 rounded border border-destructive/20">
            <div className="text-xs font-medium text-destructive mb-1">Last Error</div>
            <p className="text-[10px] text-muted-foreground">{state.lastError}</p>
          </div>
        )}
      </div>
    </Card>
  )
}
