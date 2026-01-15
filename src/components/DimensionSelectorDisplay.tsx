import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { 
  CircleDashed, 
  CheckCircle, 
  Warning, 
  XCircle, 
  Stack, 
  Gear 
} from '@phosphor-icons/react'
import { 
  DimensionSelectionResult, 
  getDimensionSelectionDescription,
  SMALL_BIAS_THRESHOLD,
  LARGE_BIAS_THRESHOLD
} from '@/lib/dimension-selector'

interface DimensionSelectorDisplayProps {
  result: DimensionSelectionResult | null
  totalSignatures: number
  isComputing?: boolean
}

export function DimensionSelectorDisplay({ 
  result, 
  totalSignatures,
  isComputing = false 
}: DimensionSelectorDisplayProps) {
  if (isComputing) {
    return (
      <Card className="p-4 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
        <div className="flex items-center gap-3">
          <div className="animate-spin">
            <CircleDashed size={24} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Analyzing signatures...</p>
            <p className="text-xs text-muted-foreground">Determining optimal lattice dimension</p>
          </div>
        </div>
      </Card>
    )
  }

  if (!result) {
    return (
      <Card className="p-4 bg-muted/30 border-border/50">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Gear size={24} />
          <div>
            <p className="text-sm font-medium">Dimension Selector</p>
            <p className="text-xs">Upload signatures to auto-configure lattice parameters</p>
          </div>
        </div>
      </Card>
    )
  }

  if (!result.isValid) {
    return (
      <Card className="p-4 bg-destructive/5 border-destructive/30">
        <div className="flex items-start gap-3">
          <XCircle size={28} weight="duotone" className="text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-destructive">Insufficient Data</h3>
              <p className="text-xs text-destructive/80 mt-1">
                {result.insufficientDataReason}
              </p>
            </div>
            
            <Alert className="bg-background/50 border-destructive/20">
              <AlertDescription className="text-xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Available signatures:</span>
                    <span className="font-bold text-destructive">{totalSignatures}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Minimum required:</span>
                    <span className="font-bold">{result.minRequiredRows}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Estimated bias:</span>
                    <span className="font-bold">{result.expectedBiasBits} bits</span>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
            
            <p className="text-xs text-muted-foreground">
              💡 <strong>Tip:</strong> Upload more signatures from the same address, or look for signatures with stronger bias patterns.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  const getBiasCategory = () => {
    if (result.expectedBiasBits < SMALL_BIAS_THRESHOLD) {
      return { label: 'Small', color: 'bg-warning text-warning-foreground' }
    } else if (result.expectedBiasBits >= LARGE_BIAS_THRESHOLD) {
      return { label: 'Large (MSB)', color: 'bg-success text-success-foreground' }
    } else {
      return { label: 'Medium', color: 'bg-accent text-accent-foreground' }
    }
  }

  const biasCategory = getBiasCategory()

  return (
    <Card className="p-4 bg-gradient-to-br from-success/5 to-primary/5 border-success/30">
      <div className="flex items-start gap-3">
        <CheckCircle size={28} weight="duotone" className="text-success flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-bold text-success">Dimension Configured</h3>
              <Badge variant="outline" className={biasCategory.color}>
                {biasCategory.label} Bias
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {getDimensionSelectionDescription(result)}
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-background/50 rounded-lg p-2 text-center border border-border/30">
              <div className="text-lg font-bold text-primary">{result.selectedDimension}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Dimension</div>
            </div>
            <div className="bg-background/50 rounded-lg p-2 text-center border border-border/30">
              <div className="text-lg font-bold text-accent">{result.expectedBiasBits}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Bias Bits</div>
            </div>
            <div className="bg-background/50 rounded-lg p-2 text-center border border-border/30">
              <div className="text-lg font-bold">{result.recommendedBlockSize}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Block Size</div>
            </div>
            <div className="bg-background/50 rounded-lg p-2 text-center border border-border/30">
              <div className="text-lg font-bold">{result.batchCount}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Batches</div>
            </div>
          </div>

          {result.batchCount > 1 && (
            <Alert className="bg-accent/10 border-accent/30">
              <Stack size={16} className="text-accent" />
              <AlertDescription className="text-xs">
                <strong>Batch Mode Enabled:</strong> {totalSignatures} signatures will be processed in {result.batchCount} parallel batches of ~{result.batches[0]?.length || 80} signatures each. This prevents browser hangs with large datasets.
              </AlertDescription>
            </Alert>
          )}

          {result.selectedDimension < 40 && (
            <Alert className="bg-warning/10 border-warning/30">
              <Warning size={16} className="text-warning" />
              <AlertDescription className="text-xs">
                <strong>Low Dimension Warning:</strong> {result.selectedDimension}×{result.selectedDimension} lattice may produce unreliable results. Consider uploading more signatures to reach 40+ dimension.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </Card>
  )
}

// Constants exported for use in other components
export { SMALL_BIAS_THRESHOLD, LARGE_BIAS_THRESHOLD }
