import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { MagnifyingGlass, CheckCircle, XCircle, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { scanRPCForWeakSignatures, generateLatticeFromWeakSignatures, type WeakSignature, type ScanResult } from '@/lib/rpc-scanner'

interface RPCScannerProps {
  onAttackGenerated: (basis: number[][], delta: number, name: string, description: string) => void
}

export function RPCScanner({ onAttackGenerated }: RPCScannerProps) {
  const [rpcUrl, setRpcUrl] = useState('https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY')
  const [fromBlock, setFromBlock] = useState('20000000')
  const [toBlock, setToBlock] = useState('20000010')
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  const handleScan = async () => {
    const from = parseInt(fromBlock)
    const to = parseInt(toBlock)

    if (isNaN(from) || isNaN(to)) {
      toast.error('Invalid block numbers')
      return
    }

    if (to < from) {
      toast.error('End block must be greater than start block')
      return
    }

    if (to - from > 1000) {
      toast.error('Block range too large. Maximum 1000 blocks per scan.')
      return
    }

    setIsScanning(true)
    setScanProgress(0)
    setScanResult(null)

    try {
      const result = await scanRPCForWeakSignatures(
        rpcUrl,
        from,
        to,
        (current, total) => {
          setScanProgress((current / total) * 100)
        }
      )

      setScanResult(result)
      
      if (result.weakSignatures.length > 0) {
        toast.success(`Found ${result.weakSignatures.length} weak signature(s)!`)
      } else {
        toast.info('No weak signatures detected in this range')
      }
    } catch (error) {
      toast.error(`Scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      console.error('Scan error:', error)
    } finally {
      setIsScanning(false)
    }
  }

  const handleGenerateAttack = (weakSig: WeakSignature) => {
    const latticeConfig = generateLatticeFromWeakSignatures(weakSig)
    
    if (latticeConfig) {
      onAttackGenerated(
        latticeConfig.basis,
        latticeConfig.delta,
        `${weakSig.weakness.toUpperCase()} Attack`,
        latticeConfig.description
      )
      toast.success('Attack configuration generated!')
    } else {
      toast.error('Could not generate lattice for this weakness')
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-destructive/10 text-destructive border-destructive/20'
      case 'high':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
      case 'low':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle size={16} weight="fill" className="text-destructive" />
      case 'high':
        return <Warning size={16} weight="fill" className="text-orange-400" />
      case 'medium':
        return <Warning size={16} weight="fill" className="text-yellow-400" />
      case 'low':
        return <CheckCircle size={16} weight="fill" className="text-blue-400" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card border-border">
        <h2 className="text-lg font-semibold mb-4">RPC Node Scanner</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Scan blockchain RPC node for historically weak ECDSA/DSA signatures. Detects nonce reuse, biased k-values, and other vulnerabilities.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="rpc-url" className="text-sm font-medium mb-2 block">
              RPC Endpoint URL
            </Label>
            <Input
              id="rpc-url"
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              placeholder="https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="from-block" className="text-sm font-medium mb-2 block">
                From Block
              </Label>
              <Input
                id="from-block"
                type="number"
                value={fromBlock}
                onChange={(e) => setFromBlock(e.target.value)}
                placeholder="20000000"
              />
            </div>
            <div>
              <Label htmlFor="to-block" className="text-sm font-medium mb-2 block">
                To Block
              </Label>
              <Input
                id="to-block"
                type="number"
                value={toBlock}
                onChange={(e) => setToBlock(e.target.value)}
                placeholder="20000010"
              />
            </div>
          </div>

          <Alert>
            <AlertDescription className="text-xs">
              <strong>Note:</strong> Maximum 1000 blocks per scan. Large ranges may take several minutes. Requires valid RPC endpoint with transaction access.
            </AlertDescription>
          </Alert>

          {isScanning && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Scanning blocks...</span>
                <span>{Math.round(scanProgress)}%</span>
              </div>
              <Progress value={scanProgress} className="h-2" />
            </div>
          )}

          <Button
            onClick={handleScan}
            disabled={isScanning}
            className="w-full"
            size="lg"
          >
            {isScanning ? (
              <>
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                Scanning...
              </>
            ) : (
              <>
                <MagnifyingGlass size={16} weight="bold" />
                Scan for Weak Signatures
              </>
            )}
          </Button>
        </div>
      </Card>

      {scanResult && (
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Scan Results</h2>
            <Badge variant="outline" className="text-xs">
              {scanResult.scanned} blocks scanned in {(scanResult.duration / 1000).toFixed(2)}s
            </Badge>
          </div>

          {scanResult.weakSignatures.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle size={48} className="mx-auto mb-4 text-success" weight="fill" />
              <h3 className="text-sm font-semibold mb-2">No Weak Signatures Found</h3>
              <p className="text-xs text-muted-foreground">
                All signatures in blocks {scanResult.blockRange.from} - {scanResult.blockRange.to} appear secure
              </p>
            </div>
          ) : (
            <>
              <Alert className="mb-4 border-accent bg-accent/10">
                <AlertDescription className="text-xs">
                  <strong>Found {scanResult.weakSignatures.length} weak signature(s)</strong> - Click "Generate Attack" to auto-configure lattice reduction
                </AlertDescription>
              </Alert>

              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {scanResult.weakSignatures.map((weakSig, idx) => (
                    <div
                      key={idx}
                      className="border border-border rounded-lg p-4 bg-card/50 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {getSeverityIcon(weakSig.severity)}
                            <Badge variant="outline" className={`text-xs ${getSeverityColor(weakSig.severity)}`}>
                              {weakSig.severity.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {weakSig.weakness.replace(/-/g, ' ').toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            {weakSig.description}
                          </p>
                        </div>
                      </div>

                      <Separator />

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <span className="text-muted-foreground">Block:</span>{' '}
                          <span className="text-foreground">{weakSig.signature.blockNumber}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Tx:</span>{' '}
                          <span className="text-foreground break-all">{weakSig.signature.transactionHash}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">From:</span>{' '}
                          <span className="text-foreground">{weakSig.signature.address}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">r:</span>{' '}
                          <span className="text-foreground break-all">{weakSig.signature.r}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">s:</span>{' '}
                          <span className="text-foreground break-all">{weakSig.signature.s}</span>
                        </div>
                      </div>

                      {weakSig.relatedSignatures && weakSig.relatedSignatures.length > 0 && (
                        <>
                          <Separator />
                          <div className="text-xs">
                            <span className="text-muted-foreground">Related signatures:</span>{' '}
                            <span className="text-accent font-semibold">{weakSig.relatedSignatures.length}</span>
                          </div>
                        </>
                      )}

                      <Button
                        onClick={() => handleGenerateAttack(weakSig)}
                        size="sm"
                        className="w-full"
                        variant="default"
                      >
                        Generate Attack Configuration
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
