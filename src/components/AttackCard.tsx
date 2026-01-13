import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AttackHistory } from '@/lib/types'
import { ClockClockwise, CheckCircle, XCircle } from '@phosphor-icons/react'

interface AttackCardProps {
  history: AttackHistory
  onRerun: (history: AttackHistory) => void
}

export function AttackCard({ history, onRerun }: AttackCardProps) {
  const { config, result } = history
  const date = new Date(result.timestamp).toLocaleString()

  return (
    <Card className="p-5 bg-card/70 backdrop-blur-sm border-border/60 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-bold text-base truncate">{config.name}</h3>
            <Badge 
              variant={result.success ? 'default' : 'secondary'} 
              className={result.success ? 'bg-success/20 text-success border-success/40' : 'bg-muted text-muted-foreground'}
            >
              {config.type}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ClockClockwise size={12} weight="duotone" />
            {date}
          </p>
        </div>
        <div className="shrink-0">
          {result.success ? (
            <div className="p-2 rounded-lg bg-success/10">
              <CheckCircle className="text-success" size={24} weight="fill" />
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-muted/30">
              <XCircle className="text-muted-foreground" size={24} weight="fill" />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-secondary/30 border border-border/40">
          <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Dimension</div>
          <div className="font-bold text-sm">{config.basis.length}×{config.basis[0]?.length || 0}</div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30 border border-border/40">
          <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Iterations</div>
          <div className="font-bold text-sm">{result.iterations}</div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30 border border-border/40">
          <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Delta (δ)</div>
          <div className="font-bold text-sm">{config.delta}</div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30 border border-border/40">
          <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Time</div>
          <div className="font-bold text-sm">{result.executionTime}ms</div>
        </div>
      </div>

      {result.algorithm && (
        <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground uppercase tracking-wider">Algorithm</span>
            <span className="font-bold text-primary">{result.algorithm.toUpperCase()}</span>
          </div>
          {result.blockSize && (
            <div className="flex items-center justify-between text-xs mt-2">
              <span className="text-muted-foreground uppercase tracking-wider">Block Size</span>
              <span className="font-bold text-accent">{result.blockSize}</span>
            </div>
          )}
        </div>
      )}

      <Button
        onClick={() => onRerun(history)}
        variant="outline"
        size="sm"
        className="w-full border-primary/30 hover:bg-primary/10 hover:border-primary/50"
      >
        <ClockClockwise size={16} weight="duotone" />
        Restore & Re-run
      </Button>
    </Card>
  )
}
