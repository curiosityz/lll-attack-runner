import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface VectorDisplayProps {
  matrix: number[][]
  title: string
  highlightFirst?: boolean
  success?: boolean
}

export function VectorDisplay({ matrix, title, highlightFirst = false, success }: VectorDisplayProps) {
  const formatNumber = (num: number): string => {
    if (Math.abs(num) < 1e-10) return '0'
    if (Number.isInteger(num)) return num.toString()
    return num.toFixed(4)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold flex items-center gap-2">
          <span className="w-1 h-5 bg-accent rounded-full"></span>
          {title}
        </h3>
        {success !== undefined && (
          <Badge 
            variant={success ? 'default' : 'secondary'} 
            className={success ? 'bg-success/20 text-success border-success/40' : 'bg-muted/50 text-muted-foreground border-muted'}
          >
            {success ? '✓ Success' : '⚠ Failed'}
          </Badge>
        )}
      </div>
      <Card className="p-5 bg-card/70 backdrop-blur-sm border-border/60 shadow-lg">
        <div className="font-mono text-xs space-y-1.5 overflow-x-auto">
          {matrix.map((row, i) => (
            <div
              key={i}
              className={`flex gap-3 transition-all duration-200 ${
                highlightFirst && i === 0
                  ? 'text-accent font-bold bg-accent/15 -mx-3 px-3 py-2 rounded-lg border border-accent/30'
                  : 'text-foreground/90'
              }`}
            >
              <span className="text-muted-foreground/70 w-7 font-semibold">[{i}]</span>
              {row.map((val, j) => (
                <span key={j} className="inline-block w-20 text-right">
                  {formatNumber(val)}
                </span>
              ))}
            </div>
          ))}
        </div>
        {matrix.length === 0 && (
          <div className="text-muted-foreground text-xs text-center py-8">
            No data to display
          </div>
        )}
      </Card>
    </div>
  )
}
