import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Copy, CheckCircle, Warning, Key, Shield } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useState } from 'react'
import { PrivateKeyResult } from '@/lib/privateKeyExtractor'

interface PrivateKeyDisplayProps {
  result: PrivateKeyResult
}

export function PrivateKeyDisplay({ result }: PrivateKeyDisplayProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success(`${label} copied to clipboard`)
    setTimeout(() => setCopied(false), 2000)
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-success'
    if (confidence >= 0.7) return 'text-warning'
    return 'text-destructive'
  }

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.9) return 'High Confidence'
    if (confidence >= 0.7) return 'Medium Confidence'
    return 'Low Confidence'
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-success/10 to-accent/10 border-success/40 shadow-lg">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-success/20 rounded-xl border border-success/30">
          <Key size={28} className="text-success" weight="duotone" />
        </div>
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            Private Key Extracted
            {result.isValid && (
              <CheckCircle size={20} className="text-success" weight="fill" />
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            Method: {result.validationMethod.replace('-', ' ').toUpperCase()}
          </p>
        </div>
      </div>

      {result.isValid ? (
        <Alert className="mb-6 border-success/50 bg-success/10">
          <CheckCircle size={18} className="text-success" weight="fill" />
          <AlertDescription className="text-sm font-medium">
            ✓ Private key validated successfully! Address matches and signatures verify.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="mb-6 border-warning/50 bg-warning/10">
          <Warning size={18} className="text-warning" weight="fill" />
          <AlertDescription className="text-sm font-medium">
            ⚠ Private key extracted but validation uncertain. Use with caution.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-card/80 border border-border/60">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-2">
              <Shield size={14} weight="fill" />
              Private Key
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(result.privateKeyHex, 'Private key')}
              className="h-7 px-2 hover:bg-success/20"
            >
              {copied ? (
                <CheckCircle size={16} className="text-success" weight="fill" />
              ) : (
                <Copy size={16} />
              )}
            </Button>
          </div>
          <div className="font-mono text-sm break-all text-foreground bg-secondary/30 p-3 rounded border border-border/40">
            {result.privateKeyHex}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
            <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">
              Confidence
            </div>
            <div className={`text-lg font-bold ${getConfidenceColor(result.confidence)}`}>
              {(result.confidence * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {getConfidenceLabel(result.confidence)}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
            <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">
              Signatures Used
            </div>
            <div className="text-lg font-bold text-foreground">
              {result.signatures.length}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {result.validationMethod === 'nonce-reuse' ? 'Nonce reuse' : 'Lattice attack'}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-card/80 border border-border/60">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              Original Address
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(result.address, 'Address')}
              className="h-7 px-2"
            >
              <Copy size={14} />
            </Button>
          </div>
          <div className="font-mono text-sm break-all text-muted-foreground">
            {result.address}
          </div>
        </div>

        {result.derivedAddress && (
          <div className="p-4 rounded-lg bg-card/80 border border-border/60">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-2">
                Derived Address
                {result.isValid && (
                  <CheckCircle size={12} className="text-success" weight="fill" />
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(result.derivedAddress!, 'Derived address')}
                className="h-7 px-2"
              >
                <Copy size={14} />
              </Button>
            </div>
            <div className="font-mono text-sm break-all text-muted-foreground">
              {result.derivedAddress}
            </div>
            {result.isValid && (
              <div className="mt-2 text-xs text-success flex items-center gap-1">
                <CheckCircle size={12} weight="fill" />
                Matches original address
              </div>
            )}
          </div>
        )}

        {result.error && (
          <Alert className="border-destructive/50 bg-destructive/10">
            <Warning size={18} className="text-destructive" weight="fill" />
            <AlertDescription className="text-sm">
              {result.error}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Alert className="mt-6 border-warning/50 bg-warning/10">
        <Warning size={18} className="text-warning" weight="fill" />
        <AlertDescription className="text-sm">
          <strong>Security Warning:</strong> This private key extraction is for educational and security research purposes only. 
          Never use extracted keys for unauthorized access to funds or accounts.
        </AlertDescription>
      </Alert>
    </Card>
  )
}
