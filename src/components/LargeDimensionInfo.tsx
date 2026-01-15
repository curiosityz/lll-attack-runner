import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info, ChartLine } from '@phosphor-icons/react'

interface LargeDimensionInfoProps {
  dimension: number
  signatureCount: number
  estimatedTime: string
}

export function LargeDimensionInfo({ dimension, signatureCount, estimatedTime }: LargeDimensionInfoProps) {
  if (dimension < 30) return null

  return (
    <Card className="p-4 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/30">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-primary/20 rounded-lg">
          <ChartLine size={24} className="text-primary" weight="duotone" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
            <span className="text-primary">Large-Scale Attack Configuration</span>
          </h3>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between items-center">
              <span>Lattice Dimension:</span>
              <span className="font-mono font-semibold text-foreground">{dimension}×{dimension}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Signatures Used:</span>
              <span className="font-mono font-semibold text-foreground">{signatureCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Est. Computation:</span>
              <span className="font-semibold text-accent">{estimatedTime}</span>
            </div>
          </div>
          <Alert className="mt-3 border-primary/30 bg-primary/5">
            <AlertDescription className="text-xs flex items-start gap-2">
              <Info size={14} className="mt-0.5 flex-shrink-0" weight="bold" />
              <span>
                <strong>40-50 signatures:</strong> Required for breaking 256-bit keys with small bias (2-4 bits). 
                Higher dimensions increase success probability but require more computation time.
              </span>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </Card>
  )
}
