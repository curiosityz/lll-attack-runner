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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {success !== undefined && (
          <Badge variant={success ? 'default' : 'secondary'} className={success ? 'bg-success text-success-foreground' : ''}>
            {success ? 'Success' : 'Failed'}
          </Badge>
        )}
      </div>
      <Card className="p-4 bg-secondary/50 border-border">
        <div className="font-mono text-xs space-y-1 overflow-x-auto">
          {matrix.map((row, i) => (
            <div
              key={i}
              className={`flex gap-2 transition-colors ${
                highlightFirst && i === 0
                  ? 'text-accent font-semibold bg-accent/10 -mx-2 px-2 py-1 rounded'
                  : 'text-foreground'
              }`}
            >
              <span className="text-muted-foreground w-6">[{i}]</span>
              {row.map((val, j) => (
                <span key={j} className="inline-block w-20 text-right">
                  {formatNumber(val)}
                </span>
              ))}
            </div>
          ))}
        </div>
        {matrix.length === 0 && (
          <div className="text-muted-foreground text-xs text-center py-4">
            No data to display
          </div>
        )}
      </Card>
    </div>
  )
}
