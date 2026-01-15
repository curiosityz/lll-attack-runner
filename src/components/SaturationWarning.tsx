import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Warning, Info } from '@phosphor-icons/react'

interface SaturationWarningProps {
  dimension: number
  blockSize: number
  foundZeroInFirstPosition: boolean
}

export function SaturationWarning({ dimension, blockSize, foundZeroInFirstPosition }: SaturationWarningProps) {
  const isSaturated = blockSize >= dimension
  
  if (!foundZeroInFirstPosition && !isSaturated) {
    return null
  }

  return (
    <Card className="p-4 border-2 border-warning/50 bg-warning/5">
      <div className="flex items-start gap-3">
        <Warning size={24} weight="duotone" className="flex-shrink-0 mt-0.5 text-warning" />
        <div className="space-y-3 flex-1">
          <div>
            <h3 className="font-bold text-sm mb-1 text-warning-foreground">Attack Saturation Detected</h3>
            <p className="text-xs leading-relaxed">
              Your attack has reached its mathematical limit with the current data.
            </p>
          </div>

          {isSaturated && (
            <Alert className="bg-background/30 border-warning/20">
              <AlertDescription className="text-xs space-y-2">
                <div><strong>Saturation Effect:</strong></div>
                <div className="space-y-1 ml-2">
                  <div>• Your Block Size ({blockSize}) ≥ Matrix Dimension ({dimension})</div>
                  <div>• BKZ effectively performed a Full SVP (Shortest Vector Problem) search</div>
                  <div>• This is the absolute best vector possible in this {dimension}×{dimension} lattice</div>
                  <div>• Increasing block size further will NOT improve results</div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {foundZeroInFirstPosition && (
            <Alert className="bg-background/30 border-warning/20">
              <AlertDescription className="text-xs space-y-2">
                <div><strong>Why Index[0] = 0 is a Problem:</strong></div>
                <div className="space-y-1 ml-2">
                  <div>• Index[0] should contain the private key coefficient</div>
                  <div>• Zero means the algorithm ignored your target (the modulus/secret)</div>
                  <div>• It found a spurious relationship: random numbers that coincidentally cancel out</div>
                  <div>• This is noise, not the cryptographic secret</div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="pt-2 border-t border-warning/20">
            <div className="flex items-start gap-2 mb-2">
              <Info size={16} weight="bold" className="flex-shrink-0 mt-0.5 text-accent" />
              <h4 className="text-xs font-semibold text-accent-foreground">The Root Cause: Information Theory</h4>
            </div>
            <div className="text-xs space-y-2 text-muted-foreground ml-6">
              <div>
                <strong className="text-foreground">Secret to find:</strong> 256-bit private key
              </div>
              <div>
                <strong className="text-foreground">Your input:</strong> {dimension - 1} signature{dimension - 1 !== 1 ? 's' : ''} ({dimension}D lattice)
              </div>
              <div>
                <strong className="text-foreground">The gap:</strong> With only {dimension - 1} equations, you have insufficient information to isolate a unique 256-bit value. 
                The solver finds "shortcuts" (spurious vectors) instead of the real secret.
              </div>
            </div>
          </div>

          <Alert className="bg-accent/10 border-accent/30">
            <AlertDescription className="text-xs">
              <strong className="text-accent">Solution:</strong> Upload transaction data with <strong>40-80 signatures</strong> from the same address. 
              With more data, the real secret vector remains short while spurious vectors grow much longer, allowing the algorithm to find the actual private key.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </Card>
  )
}
