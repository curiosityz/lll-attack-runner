import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Info, Warning, CheckCircle, XCircle } from '@phosphor-icons/react'

interface DimensionGuidanceProps {
  currentDimension: number
  signatureCount: number
  attackType: string
  isNormalized: boolean
}

export function DimensionGuidance({ currentDimension, signatureCount, attackType, isNormalized }: DimensionGuidanceProps) {
  const getStatus = () => {
    if (currentDimension >= 40) {
      return {
        level: 'excellent',
        icon: CheckCircle,
        color: 'success',
        title: 'Excellent Dimension',
        message: 'Your lattice is large enough to extract the private key reliably. The attack should find the real secret rather than noise.',
        details: `With ${currentDimension}×${currentDimension} matrix, spurious solutions become much longer than the real key vector.`
      }
    } else if (currentDimension >= 20) {
      return {
        level: 'good',
        icon: Info,
        color: 'accent',
        title: 'Good Dimension',
        message: 'Your lattice may find the private key, but results could still include noise.',
        details: `Consider uploading more signatures to reach 40+ dimensions for reliable extraction.`
      }
    } else if (currentDimension >= 10) {
      return {
        level: 'marginal',
        icon: Warning,
        color: 'warning',
        title: 'Marginal Dimension',
        message: 'Your lattice is too small. The attack will likely find random coincidences (noise) rather than the actual private key.',
        details: `Need ${40 - currentDimension} more signatures to reach the 40D threshold for reliable attacks.`
      }
    } else {
      return {
        level: 'insufficient',
        icon: XCircle,
        color: 'destructive',
        title: 'Insufficient Dimension',
        message: 'Critical: This lattice cannot extract the private key. You need significantly more data.',
        details: `Current: ${currentDimension}D • Required: 40D minimum • Need ${40 - currentDimension} more signatures.`
      }
    }
  }

  const status = getStatus()
  const Icon = status.icon

  const colorClasses = {
    success: 'border-success/50 bg-success/10 text-success-foreground',
    accent: 'border-accent/50 bg-accent/10 text-accent-foreground',
    warning: 'border-warning/50 bg-warning/10 text-warning-foreground',
    destructive: 'border-destructive/50 bg-destructive/10 text-destructive-foreground'
  }

  if (currentDimension >= 40) {
    return null
  }

  return (
    <Card className={`p-4 border-2 ${colorClasses[status.color as keyof typeof colorClasses]}`}>
      <div className="flex items-start gap-3">
        <Icon size={24} weight="duotone" className="flex-shrink-0 mt-0.5" />
        <div className="space-y-2 flex-1">
          <div>
            <h3 className="font-bold text-sm mb-1">{status.title}</h3>
            <p className="text-xs leading-relaxed opacity-90">
              {status.message}
            </p>
          </div>
          
          <Alert className="bg-background/30 border-current/20">
            <AlertDescription className="text-xs">
              <strong>Technical:</strong> {status.details}
            </AlertDescription>
          </Alert>

          {currentDimension < 40 && (
            <div className="pt-2 border-t border-current/20">
              <h4 className="text-xs font-semibold mb-2">Why Dimension Matters:</h4>
              <ul className="text-xs space-y-1 opacity-90">
                <li>• <strong>Secret:</strong> 256-bit private key (the target)</li>
                <li>• <strong>Your Input:</strong> {signatureCount} signature{signatureCount !== 1 ? 's' : ''} ({currentDimension}D lattice)</li>
                <li>• <strong>The Problem:</strong> {currentDimension < 10 ? 'Far too few equations to isolate 256 bits' : currentDimension < 20 ? 'Not enough data to distinguish key from noise' : 'Close, but need more data for reliability'}</li>
                <li>• <strong>Solution:</strong> Upload {currentDimension < 10 ? 'many' : 'more'} signatures from the same address to build a 40×40+ lattice</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
