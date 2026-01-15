import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, Warning, Cpu } from '@phosphor-icons/react'

interface PrecisionIndicatorProps {
  usedHighPrecision: boolean
  originalScale?: bigint
  matrixSize: { rows: number; cols: number }
}

export function PrecisionIndicator({ usedHighPrecision, originalScale, matrixSize }: PrecisionIndicatorProps) {
  return (
    <Card className="p-4 bg-card/60 backdrop-blur-sm border-border/40">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${usedHighPrecision ? 'bg-accent/20' : 'bg-primary/20'}`}>
          <Cpu size={24} weight="duotone" className={usedHighPrecision ? 'text-accent' : 'text-primary'} />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold">Arithmetic Mode</h3>
            <Badge 
              variant={usedHighPrecision ? 'default' : 'secondary'}
              className={usedHighPrecision ? 'bg-accent/20 text-accent border-accent/40' : ''}
            >
              {usedHighPrecision ? 'High Precision (BigInt)' : 'Standard (Float64)'}
            </Badge>
          </div>
          
          <div className="text-xs text-muted-foreground space-y-1">
            <div>Matrix: {matrixSize.rows}×{matrixSize.cols}</div>
            {originalScale && originalScale > 1n && (
              <div>Scale Factor: ~10^{originalScale.toString().length - 1}</div>
            )}
          </div>
          
          {usedHighPrecision ? (
            <Alert className="mt-3 border-accent/30 bg-accent/5">
              <AlertDescription className="text-xs flex items-start gap-2">
                <CheckCircle size={16} weight="fill" className="text-accent shrink-0 mt-0.5" />
                <span>
                  Using arbitrary-precision BigInt arithmetic to handle secp256k1 values without loss of precision.
                  Results are accurate for cryptographic operations.
                </span>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="mt-3 border-primary/30 bg-primary/5">
              <AlertDescription className="text-xs flex items-start gap-2">
                <CheckCircle size={16} weight="fill" className="text-primary shrink-0 mt-0.5" />
                <span>
                  Using standard floating-point arithmetic. Values fit within JavaScript's safe integer range
                  (±2^53). Fast and efficient for this matrix size.
                </span>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </Card>
  )
}

interface PrecisionWarningProps {
  values: number[]
}

export function PrecisionWarning({ values }: PrecisionWarningProps) {
  const MAX_SAFE = Number.MAX_SAFE_INTEGER
  const hasLargeValues = values.some(v => Math.abs(v) > MAX_SAFE / 10)
  const hasUnsafeValues = values.some(v => Math.abs(v) > MAX_SAFE)
  
  if (!hasLargeValues && !hasUnsafeValues) {
    return null
  }
  
  return (
    <Alert className="border-warning/50 bg-warning/10">
      <AlertDescription className="text-sm flex items-start gap-2">
        <Warning size={18} weight="fill" className="text-warning shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold mb-1">Large Values Detected</div>
          <div className="text-xs text-muted-foreground">
            {hasUnsafeValues ? (
              <>
                Some values exceed JavaScript's safe integer range (2^53). The system will automatically
                use high-precision BigInt arithmetic to ensure accurate results.
              </>
            ) : (
              <>
                Values approaching JavaScript's precision limits. Consider using high-precision mode
                if you experience numerical instability.
              </>
            )}
          </div>
        </div>
      </AlertDescription>
    </Alert>
  )
}
