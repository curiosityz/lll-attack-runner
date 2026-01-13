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
    <Card className="p-5 bg-card border-border hover:border-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm truncate">{config.name}</h3>
            <Badge variant={result.success ? 'default' : 'secondary'} className="shrink-0">
              {config.type}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>
        <div className="shrink-0">
          {result.success ? (
            <CheckCircle className="text-success" size={20} weight="fill" />
          ) : (
            <XCircle className="text-muted-foreground" size={20} weight="fill" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
        <div>
          <div className="text-muted-foreground mb-1">Dimension</div>
          <div className="font-medium">{config.basis.length}×{config.basis[0]?.length || 0}</div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1">Iterations</div>
          <div className="font-medium">{result.iterations}</div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1">Delta (δ)</div>
          <div className="font-medium">{config.delta}</div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1">Time</div>
          <div className="font-medium">{result.executionTime}ms</div>
        </div>
      </div>

      <Button
        onClick={() => onRerun(history)}
        variant="outline"
        size="sm"
        className="w-full"
      >
        <ClockClockwise size={16} />
        Restore & Re-run
      </Button>
    </Card>
  )
}
