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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MagnifyingGlass, CheckCircle, XCircle, Warning, ChartLine, Brain } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { scanRPCForWeakSignatures, generateLatticeFromWeakSignatures, type WeakSignature, type ScanResult } from '@/lib/rpc-scanner'
import { performBatchAnalysis, generateBatchAttackConfiguration, type BatchAnalysisResult, type SignatureCluster } from '@/lib/batch-analysis'
import { generateAIPredictions, type MLPredictionResult } from '@/lib/ml-predictor'
import { BatchAnalysisDisplay } from '@/components/BatchAnalysisDisplay'
import { MLPredictionDisplay } from '@/components/MLPredictionDisplay'
import { BlockchainStatus } from '@/components/BlockchainStatus'
import { RPCTestUtility } from '@/components/RPCTestUtility'
import { HexFormatTest } from '@/components/HexFormatTest'

interface RPCScannerProps {
  onAttackGenerated: (basis: number[][], delta: number, name: string, description: string, algorithm?: 'lll' | 'bkz', blockSize?: number) => void
}

export function RPCScanner({ onAttackGenerated }: RPCScannerProps) {
  const [rpcUrl, setRpcUrl] = useState('https://eth.llamarpc.com')
  const [fromBlock, setFromBlock] = useState('21000000')
  const [toBlock, setToBlock] = useState('21000005')
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [batchAnalysis, setBatchAnalysis] = useState<BatchAnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [mlPredictions, setMlPredictions] = useState<MLPredictionResult | null>(null)
  const [isPredicting, setIsPredicting] = useState(false)
  const [predictionFromBlock, setPredictionFromBlock] = useState('21000010')
  const [predictionToBlock, setPredictionToBlock] = useState('21000050')
  const [autoScanInProgress, setAutoScanInProgress] = useState(false)
  const [autoScanQueue, setAutoScanQueue] = useState<{ from: number; to: number }[]>([])

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
    setBatchAnalysis(null)
    setScanError(null)

    try {
      toast.info('Connecting to RPC endpoint...')
      
      const result = await scanRPCForWeakSignatures(
        rpcUrl,
        from,
        to,
        (current, total) => {
          setScanProgress((current / total) * 100)
        }
      )

      setScanResult(result)
      setScanError(null)
      
      if (result.weakSignatures.length > 0) {
        toast.success(`Scan complete! Found ${result.weakSignatures.length} weak signature(s) in ${result.allSignatures.length} total signatures.`)
      } else if (result.allSignatures.length > 0) {
        toast.success(`Scan complete! Analyzed ${result.allSignatures.length} signatures - no weaknesses detected.`)
      } else {
        toast.info(`Scan complete. No transactions with signatures found in blocks ${from}-${to}.`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setScanError(errorMessage)
      toast.error(`Scan failed: ${errorMessage}`)
      console.error('Scan error:', error)
    } finally {
      setIsScanning(false)
    }
  }

  const handleBatchAnalysis = () => {
    if (!scanResult) return

    setIsAnalyzing(true)
    
    try {
      const allSignatures = scanResult.allSignatures

      if (allSignatures.length === 0) {
        toast.info('No signatures to analyze')
        return
      }

      const analysis = performBatchAnalysis(allSignatures)
      setBatchAnalysis(analysis)
      
      toast.success(`Batch analysis complete: ${analysis.clusters.length} pattern cluster(s) detected`)
    } catch (error) {
      toast.error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      console.error('Analysis error:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleGenerateFromCluster = (cluster: SignatureCluster) => {
    const config = generateBatchAttackConfiguration(cluster)
    
    if (config) {
      onAttackGenerated(
        config.basis,
        config.delta,
        `${cluster.pattern.toUpperCase()} Batch Attack`,
        config.description,
        config.algorithm,
        config.blockSize
      )
      toast.success('Batch attack configuration generated!')
    } else {
      toast.error('Could not generate attack from this cluster')
    }
  }

  const handleMLPrediction = async () => {
    if (!scanResult || scanResult.allSignatures.length === 0) {
      toast.error('Please scan blocks first to train the ML model')
      return
    }

    const from = parseInt(predictionFromBlock)
    const to = parseInt(predictionToBlock)

    if (isNaN(from) || isNaN(to)) {
      toast.error('Invalid prediction block numbers')
      return
    }

    if (to < from) {
      toast.error('End block must be greater than start block')
      return
    }

    if (to - from > 500) {
      toast.error('Prediction range too large. Maximum 500 blocks.')
      return
    }

    setIsPredicting(true)
    setMlPredictions(null)

    try {
      const predictions = await generateAIPredictions(
        scanResult.allSignatures,
        scanResult.weakSignatures,
        batchAnalysis,
        { from, to }
      )

      setMlPredictions(predictions)
      
      const highPriority = predictions.predictions.filter(
        p => p.suggestedScanPriority === 'critical' || p.suggestedScanPriority === 'high'
      ).length

      toast.success(`ML predictions generated! ${highPriority} high-priority blocks identified`)
    } catch (error) {
      toast.error(`Prediction failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      console.error('Prediction error:', error)
    } finally {
      setIsPredicting(false)
    }
  }

  const handlePredictedBlockScan = async (blockNumber: number) => {
    setFromBlock(blockNumber.toString())
    setToBlock(blockNumber.toString())
    toast.info(`Configured scan for predicted block ${blockNumber}`)
  }

  const handlePredictedRangeScan = async (from: number, to: number) => {
    setFromBlock(from.toString())
    setToBlock(to.toString())
    toast.info(`Configured scan for predicted range ${from}-${to}`)
  }

  const handleAutoScanAll = async (recommendations: import('@/lib/ml-predictor').ScanRecommendation[]) => {
    if (recommendations.length === 0) {
      toast.info('No recommendations to scan')
      return
    }

    const queue = recommendations.map(rec => ({
      from: rec.blocks[0],
      to: rec.blocks[rec.blocks.length - 1]
    }))

    setAutoScanQueue(queue)
    setAutoScanInProgress(true)
    
    toast.info(`Starting auto-scan of ${queue.length} recommended range${queue.length !== 1 ? 's' : ''}...`)

    for (let i = 0; i < queue.length; i++) {
      const range = queue[i]
      toast.info(`Scanning range ${i + 1}/${queue.length}: Blocks ${range.from}-${range.to}`)
      
      setFromBlock(range.from.toString())
      setToBlock(range.to.toString())
      
      try {
        const result = await scanRPCForWeakSignatures(
          rpcUrl,
          range.from,
          range.to,
          (current, total) => {
            setScanProgress((current / total) * 100)
          }
        )

        const currentResult = scanResult
        if (currentResult) {
          setScanResult({
            ...result,
            allSignatures: [...currentResult.allSignatures, ...result.allSignatures],
            weakSignatures: [...currentResult.weakSignatures, ...result.weakSignatures],
            scanned: currentResult.scanned + result.scanned
          })
        } else {
          setScanResult(result)
        }

        if (result.weakSignatures.length > 0) {
          toast.success(`Found ${result.weakSignatures.length} weak signature(s) in range ${range.from}-${range.to}`)
        }
      } catch (error) {
        toast.error(`Failed to scan range ${range.from}-${range.to}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      if (i < queue.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    setAutoScanInProgress(false)
    setAutoScanQueue([])
    toast.success(`Auto-scan complete! Scanned ${queue.length} range${queue.length !== 1 ? 's' : ''}`)
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
      <BlockchainStatus rpcUrl={rpcUrl} />
      
      <div className="grid lg:grid-cols-2 gap-6">
        <RPCTestUtility />
        <HexFormatTest />
      </div>
      
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
              placeholder="https://eth.llamarpc.com"
              className="font-mono text-xs"
            />
            <div className="flex gap-2 mt-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setRpcUrl('https://eth.llamarpc.com')}
              >
                LlamaRPC
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setRpcUrl('https://rpc.ankr.com/eth')}
              >
                Ankr
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setRpcUrl('https://ethereum.publicnode.com')}
              >
                PublicNode
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setRpcUrl('https://cloudflare-eth.com')}
              >
                Cloudflare
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setRpcUrl('https://1rpc.io/eth')}
              >
                1RPC
              </Button>
            </div>
            <Alert className="mt-3">
              <AlertDescription className="text-xs">
                <strong>Private RPC endpoints:</strong> Supports Infura, Alchemy, QuickNode, Google Cloud Blockchain RPC, and other providers. 
                Just paste your full URL with API key (e.g., <code className="text-accent">https://mainnet.infura.io/v3/YOUR_KEY</code> or 
                <code className="text-accent ml-1">https://blockchain.googleapis.com/v1/projects/PROJECT/locations/LOCATION/endpoints/ENDPOINT/rpc?key=API_KEY</code>)
              </AlertDescription>
            </Alert>
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
                placeholder="21000000"
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
                placeholder="21000005"
              />
            </div>
          </div>

          <Alert>
            <AlertDescription className="text-xs">
              <strong>Note:</strong> Maximum 1000 blocks per scan. Large ranges may take several minutes. Requires valid RPC endpoint with transaction access.
            </AlertDescription>
          </Alert>

          {scanError && (
            <Alert className="border-destructive bg-destructive/10">
              <XCircle size={16} weight="fill" className="text-destructive" />
              <AlertDescription className="text-xs ml-2">
                <strong>Scan Error:</strong> {scanError}
              </AlertDescription>
            </Alert>
          )}

          {isScanning && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Scanning blocks {fromBlock} to {toBlock}...</span>
                <span>{Math.round(scanProgress)}%</span>
              </div>
              <Progress value={scanProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                Fetching transactions and analyzing signatures... Check console for detailed progress.
              </p>
            </div>
          )}

          <Button
            onClick={handleScan}
            disabled={isScanning || autoScanInProgress}
            className="w-full"
            size="lg"
          >
            {isScanning || autoScanInProgress ? (
              <>
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                {autoScanInProgress ? `Auto-Scanning... (${autoScanQueue.length} remaining)` : 'Scanning...'}
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
        <>
          <Card className="p-6 bg-card border-border">
            <Tabs defaultValue="individual" className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Scan Results</h2>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {scanResult.scanned} blocks
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {scanResult.allSignatures.length} signatures
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {(scanResult.duration / 1000).toFixed(2)}s
                  </Badge>
                  {scanResult.weakSignatures.length > 0 && (
                    <Button
                      onClick={handleBatchAnalysis}
                      disabled={isAnalyzing}
                      size="sm"
                      variant="secondary"
                    >
                      {isAnalyzing ? (
                        <>
                          <div className="animate-spin mr-2 h-3 w-3 border-2 border-secondary-foreground border-t-transparent rounded-full" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <ChartLine size={14} className="mr-2" />
                          Run Batch Analysis
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="individual">
                  Individual Signatures ({scanResult.weakSignatures.length})
                </TabsTrigger>
                <TabsTrigger value="batch" disabled={!batchAnalysis}>
                  Batch Analysis {batchAnalysis && `(${batchAnalysis.clusters.length})`}
                </TabsTrigger>
                <TabsTrigger value="ml-prediction">
                  ML Predictions
                </TabsTrigger>
              </TabsList>

              <TabsContent value="individual">
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
                        <strong>Found {scanResult.weakSignatures.length} weak signature(s)</strong> - Click "Generate Attack" for individual attacks or "Run Batch Analysis" for pattern detection
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
              </TabsContent>

              <TabsContent value="batch">
                {batchAnalysis ? (
                  <BatchAnalysisDisplay 
                    analysis={batchAnalysis} 
                    onGenerateAttack={handleGenerateFromCluster}
                  />
                ) : (
                  <div className="text-center py-12">
                    <ChartLine size={48} className="mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold mb-2">No Batch Analysis Yet</h3>
                    <p className="text-xs text-muted-foreground">
                      Click "Run Batch Analysis" to detect patterns across multiple signatures
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="ml-prediction">
                <div className="space-y-4">
                  <Card className="p-4 bg-secondary/30 border-border">
                    <div className="flex items-center gap-3 mb-3">
                      <Brain size={20} className="text-accent" weight="fill" />
                      <h3 className="text-sm font-semibold">Configure ML Prediction</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      Use machine learning to predict vulnerable blocks based on historical scan data
                    </p>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <Label htmlFor="pred-from-block" className="text-xs font-medium mb-1 block">
                          Predict From Block
                        </Label>
                        <Input
                          id="pred-from-block"
                          type="number"
                          value={predictionFromBlock}
                          onChange={(e) => setPredictionFromBlock(e.target.value)}
                          placeholder="21000020"
                          className="text-xs"
                        />
                      </div>
                      <div>
                        <Label htmlFor="pred-to-block" className="text-xs font-medium mb-1 block">
                          Predict To Block
                        </Label>
                        <Input
                          id="pred-to-block"
                          type="number"
                          value={predictionToBlock}
                          onChange={(e) => setPredictionToBlock(e.target.value)}
                          placeholder="21000100"
                          className="text-xs"
                        />
                      </div>
                    </div>

                    <Alert className="mb-3">
                      <AlertDescription className="text-xs">
                        ML model trains on your scan results. More historical data = better predictions. Maximum 500 blocks per prediction.
                      </AlertDescription>
                    </Alert>

                    <Button
                      onClick={handleMLPrediction}
                      disabled={isPredicting || !scanResult}
                      className="w-full"
                      size="sm"
                    >
                      {isPredicting ? (
                        <>
                          <div className="animate-spin mr-2 h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full" />
                          Predicting...
                        </>
                      ) : (
                        <>
                          <Brain size={14} weight="fill" />
                          Generate ML Predictions
                        </>
                      )}
                    </Button>
                  </Card>

                  {mlPredictions ? (
                    <MLPredictionDisplay
                      predictionResult={mlPredictions}
                      onScanBlock={handlePredictedBlockScan}
                      onScanRange={handlePredictedRangeScan}
                      onAutoScanAll={handleAutoScanAll}
                    />
                  ) : (
                    <Card className="p-6 bg-card border-border">
                      <div className="text-center py-12">
                        <Brain size={48} className="mx-auto mb-4 text-muted-foreground" weight="fill" />
                        <h3 className="text-sm font-semibold mb-2">No Predictions Yet</h3>
                        <p className="text-xs text-muted-foreground">
                          {scanResult 
                            ? 'Configure the prediction range and generate ML predictions'
                            : 'Scan blocks first to train the ML model with historical data'
                          }
                        </p>
                      </div>
                    </Card>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </>
      )}
    </div>
  )
}
