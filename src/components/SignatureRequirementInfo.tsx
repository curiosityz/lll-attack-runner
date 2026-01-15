import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Lightbulb, ArrowRight, CheckCircle } from '@phosphor-icons/react'

interface SignatureRequirementInfoProps {
  currentCount: number
}

export function SignatureRequirementInfo({ currentCount }: SignatureRequirementInfoProps) {
  const progress = Math.min((currentCount / 40) * 100, 100)
  const isGood = currentCount >= 40
  const isOk = currentCount >= 20
  
  return (
    <Card className="p-6 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
          <Lightbulb size={28} weight="duotone" className="text-primary" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="text-lg font-bold mb-1">Understanding Lattice Dimension Requirements</h3>
            <p className="text-sm text-muted-foreground">
              The success of your attack depends on having enough data to build a large lattice
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Current signatures uploaded:</span>
              <span className={`font-bold ${isGood ? 'text-success' : isOk ? 'text-warning' : 'text-destructive'}`}>
                {currentCount} / 40+ needed
              </span>
            </div>
            
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${
                  isGood ? 'bg-success' : isOk ? 'bg-warning' : 'bg-destructive'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <Alert className="bg-background/50 border-primary/30">
            <AlertDescription className="text-xs space-y-2">
              <div className="font-semibold text-foreground mb-2">The Mathematics:</div>
              <div className="space-y-1.5 text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold min-w-[20px]">1.</span>
                  <span><strong>Target:</strong> 256-bit private key (the secret you're trying to find)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold min-w-[20px]">2.</span>
                  <span><strong>Your Input:</strong> {currentCount} signature{currentCount !== 1 ? 's' : ''} = {currentCount + 1}×{currentCount + 1} lattice matrix</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold min-w-[20px]">3.</span>
                  <span>
                    <strong>The Problem:</strong> With only {currentCount} equations, you have insufficient information to isolate a unique 256-bit value. 
                    {currentCount < 10 && ' BKZ will find random noise (spurious coincidences) instead of the real key.'}
                    {currentCount >= 10 && currentCount < 40 && ' You might find partial information, but results will be unreliable.'}
                    {currentCount >= 40 && ' You have enough data to extract the private key!'}
                  </span>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          <div className="grid md:grid-cols-3 gap-3 pt-2">
            <div className={`p-3 rounded-lg border-2 ${currentCount < 10 ? 'border-destructive/50 bg-destructive/5' : 'border-border/30 bg-muted/30'}`}>
              <div className="text-xs font-semibold mb-1 flex items-center gap-1">
                {currentCount < 10 ? '❌' : '✓'} <span className="opacity-70">1-9 Signatures</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Insufficient: Finds noise, not key
              </div>
            </div>
            
            <div className={`p-3 rounded-lg border-2 ${currentCount >= 10 && currentCount < 40 ? 'border-warning/50 bg-warning/5' : 'border-border/30 bg-muted/30'}`}>
              <div className="text-xs font-semibold mb-1 flex items-center gap-1">
                {currentCount >= 10 && currentCount < 40 ? '⚠️' : currentCount >= 40 ? '✓' : '○'} <span className="opacity-70">10-39 Signatures</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Marginal: Unreliable results
              </div>
            </div>
            
            <div className={`p-3 rounded-lg border-2 ${currentCount >= 40 ? 'border-success/50 bg-success/5' : 'border-border/30 bg-muted/30'}`}>
              <div className="text-xs font-semibold mb-1 flex items-center gap-1">
                {currentCount >= 40 ? <CheckCircle size={14} weight="fill" className="text-success" /> : '○'} <span className="opacity-70">40+ Signatures</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Excellent: Key extraction likely
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs bg-accent/10 border border-accent/30 rounded-lg p-3">
            <ArrowRight size={16} weight="bold" className="text-accent flex-shrink-0" />
            <div>
              <strong className="text-accent">Next Step:</strong> Upload transaction data with 40+ signatures from the same address to build a high-dimensional lattice
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
