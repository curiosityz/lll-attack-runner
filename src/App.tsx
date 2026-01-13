import { useState } from 'react'
import { useKV } from '@github/spark/hooks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Play, Lightbulb, Calculator, ListBullets, ChartLine, CloudArrowDown } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { AttackHistory, AttackType, AttackTemplate, LLLStep, AlgorithmType } from '@/lib/types'
import { runLLL, parseBasisFromString } from '@/lib/lll'
import { runBKZ } from '@/lib/bkz'
import { MatrixInput } from '@/components/MatrixInput'
import { VectorDisplay } from '@/components/VectorDisplay'
import { AttackCard } from '@/components/AttackCard'
import { TemplateDialog } from '@/components/TemplateDialog'
import { VectorVisualization } from '@/components/VectorVisualization'
import { MatrixHeatmap } from '@/components/MatrixHeatmap'
import { OrthogonalityChart } from '@/components/OrthogonalityChart'
import { RPCScanner } from '@/components/RPCScanner'

function App() {
  const [attackHistory, setAttackHistory] = useKV<AttackHistory[]>('attack-history', [])
  
  const [attackType, setAttackType] = useState<AttackType>('custom')
  const [attackName, setAttackName] = useState('Custom Attack')
  const [basisInput, setBasisInput] = useState('1 2 3\n4 5 6\n7 8 9')
  const [delta, setDelta] = useState('0.75')
  const [algorithm, setAlgorithm] = useState<AlgorithmType>('lll')
  const [blockSize, setBlockSize] = useState('10')
  const [isRunning, setIsRunning] = useState(false)
  const [captureVisualization, setCaptureVisualization] = useState(false)
  const [visualizationSteps, setVisualizationSteps] = useState<LLLStep[]>([])
  const [currentVisualizationStep, setCurrentVisualizationStep] = useState(0)
  const [result, setResult] = useState<{
    reducedBasis: number[][]
    iterations: number
    executionTime: number
    success: boolean
    solutionVector?: number[]
    algorithm?: AlgorithmType
    blockSize?: number
  } | null>(null)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)

  const handleRunAttack = async () => {
    const basis = parseBasisFromString(basisInput)
    if (!basis) {
      toast.error('Invalid matrix format')
      return
    }

    const deltaValue = parseFloat(delta)
    if (isNaN(deltaValue) || deltaValue <= 0.25 || deltaValue >= 1) {
      toast.error('Delta must be between 0.25 and 1')
      return
    }

    setIsRunning(true)
    setResult(null)
    setVisualizationSteps([])

    await new Promise(resolve => setTimeout(resolve, 100))

    const startTime = performance.now()
    
    let lllResult: any
    
    if (algorithm === 'bkz') {
      const blockSizeValue = parseInt(blockSize)
      if (isNaN(blockSizeValue) || blockSizeValue < 2) {
        toast.error('Block size must be at least 2')
        setIsRunning(false)
        return
      }
      lllResult = runBKZ(basis, blockSizeValue, deltaValue, captureVisualization)
    } else {
      lllResult = runLLL(basis, deltaValue, captureVisualization)
    }
    
    const endTime = performance.now()
    const executionTime = Math.round(endTime - startTime)

    const newResult = {
      reducedBasis: lllResult.reducedBasis,
      iterations: lllResult.iterations,
      executionTime,
      success: lllResult.success,
      solutionVector: lllResult.solutionVector,
      algorithm,
      blockSize: algorithm === 'bkz' ? lllResult.blockSize : undefined
    }

    setResult(newResult)
    setIsRunning(false)

    if (lllResult.steps) {
      setVisualizationSteps(lllResult.steps)
      setCurrentVisualizationStep(0)
    }

    const newHistory: AttackHistory = {
      config: {
        id: Date.now().toString(),
        type: attackType,
        name: attackName,
        basis,
        delta: deltaValue,
        timestamp: Date.now(),
        algorithm,
        blockSize: algorithm === 'bkz' ? parseInt(blockSize) : undefined
      },
      result: {
        configId: Date.now().toString(),
        success: lllResult.success,
        reducedBasis: lllResult.reducedBasis,
        solutionVector: lllResult.solutionVector,
        iterations: lllResult.iterations,
        executionTime,
        timestamp: Date.now(),
        algorithm,
        blockSize: algorithm === 'bkz' ? lllResult.blockSize : undefined
      }
    }

    setAttackHistory((current) => [newHistory, ...(current || [])].slice(0, 50))

    if (lllResult.success) {
      toast.success(`Attack completed successfully! (${algorithm.toUpperCase()})`)
    } else {
      toast.error('Attack completed but may not have converged')
    }
  }

  const handleTemplateSelect = (template: AttackTemplate) => {
    setAttackType(template.type)
    setAttackName(template.name)
    setBasisInput(template.basis.map(row => row.join(' ')).join('\n'))
    setDelta(template.delta.toString())
    setResult(null)
    setVisualizationSteps([])
    toast.success(`Loaded template: ${template.name}`)
  }

  const handleRerun = (history: AttackHistory) => {
    setAttackType(history.config.type)
    setAttackName(history.config.name)
    setBasisInput(history.config.basis.map(row => row.join(' ')).join('\n'))
    setDelta(history.config.delta.toString())
    setAlgorithm(history.config.algorithm || 'lll')
    if (history.config.blockSize) {
      setBlockSize(history.config.blockSize.toString())
    }
    setResult(null)
    setVisualizationSteps([])
    toast.success('Configuration restored')
  }

  const handleClearHistory = () => {
    setAttackHistory([])
    toast.success('History cleared')
  }

  const handleRPCAttackGenerated = (basis: number[][], delta: number, name: string, description: string) => {
    setAttackType('signature-scan')
    setAttackName(name)
    setBasisInput(basis.map(row => row.join(' ')).join('\n'))
    setDelta(delta.toString())
    setAlgorithm('lll')
    setResult(null)
    setVisualizationSteps([])
    
    toast.success(`${name} configured - ready to run!`, {
      description: description
    })
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Calculator size={32} className="text-accent" weight="bold" />
            <h1 className="text-3xl font-bold tracking-tight">Advanced LLL/BKZ Attack Runner</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Lattice basis reduction with RPC signature scanning and automated attack generation
          </p>
        </header>

        <Tabs defaultValue="attack" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 max-w-3xl">
            <TabsTrigger value="attack">
              <Play size={16} className="mr-2" />
              Attack
            </TabsTrigger>
            <TabsTrigger value="scanner">
              <CloudArrowDown size={16} className="mr-2" />
              RPC Scanner
            </TabsTrigger>
            <TabsTrigger value="visualization" disabled={visualizationSteps.length === 0}>
              <ChartLine size={16} className="mr-2" />
              Visualization
            </TabsTrigger>
            <TabsTrigger value="history">
              <ListBullets size={16} className="mr-2" />
              History
            </TabsTrigger>
            <TabsTrigger value="help">
              <Lightbulb size={16} className="mr-2" />
              Help
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attack" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                <Card className="p-6 bg-card border-border">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Attack Configuration</h2>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTemplateDialogOpen(true)}
                    >
                      <Lightbulb size={16} />
                      Templates
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="attack-type" className="text-sm font-medium mb-2 block">
                        Attack Type
                      </Label>
                      <Select value={attackType} onValueChange={(v) => setAttackType(v as AttackType)}>
                        <SelectTrigger id="attack-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Custom</SelectItem>
                          <SelectItem value="rsa">RSA Attack</SelectItem>
                          <SelectItem value="subset-sum">Subset Sum</SelectItem>
                          <SelectItem value="knapsack">Knapsack</SelectItem>
                          <SelectItem value="cvp">Closest Vector Problem</SelectItem>
                          <SelectItem value="hnp">Hidden Number Problem</SelectItem>
                          <SelectItem value="ntru">NTRU</SelectItem>
                          <SelectItem value="dsa">DSA/ECDSA</SelectItem>
                          <SelectItem value="signature-scan">Signature Scan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="algorithm" className="text-sm font-medium mb-2 block">
                        Algorithm
                      </Label>
                      <Select value={algorithm} onValueChange={(v) => setAlgorithm(v as AlgorithmType)}>
                        <SelectTrigger id="algorithm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lll">LLL (Standard)</SelectItem>
                          <SelectItem value="bkz">BKZ (Block Korkine-Zolotarev)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        BKZ provides stronger reduction but takes longer
                      </p>
                    </div>

                    {algorithm === 'bkz' && (
                      <div>
                        <Label htmlFor="block-size" className="text-sm font-medium mb-2 block">
                          Block Size
                        </Label>
                        <Input
                          id="block-size"
                          type="number"
                          min="2"
                          max="30"
                          value={blockSize}
                          onChange={(e) => setBlockSize(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Larger blocks = better reduction but slower (typical: 10-20)
                        </p>
                      </div>
                    )}

                    <div>
                      <Label htmlFor="attack-name" className="text-sm font-medium mb-2 block">
                        Attack Name
                      </Label>
                      <Input
                        id="attack-name"
                        value={attackName}
                        onChange={(e) => setAttackName(e.target.value)}
                        placeholder="My Custom Attack"
                      />
                    </div>

                    <MatrixInput
                      value={basisInput}
                      onChange={setBasisInput}
                      label="Lattice Basis Matrix"
                      placeholder="Enter basis vectors (one per line):"
                    />

                    <div>
                      <Label htmlFor="delta" className="text-sm font-medium mb-2 block">
                        Delta Parameter (δ)
                      </Label>
                      <Input
                        id="delta"
                        type="number"
                        step="0.01"
                        min="0.25"
                        max="0.99"
                        value={delta}
                        onChange={(e) => setDelta(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Typical range: 0.75 (fast) to 0.99 (better reduction)
                      </p>
                    </div>

                    <Separator />

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="capture-visualization"
                        checked={captureVisualization}
                        onCheckedChange={(checked) => setCaptureVisualization(checked as boolean)}
                      />
                      <Label htmlFor="capture-visualization" className="text-sm font-medium cursor-pointer">
                        Capture visualization steps
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Enable to see animated vector transformations (may slow down large attacks)
                    </p>

                    <Separator />

                    <Button
                      onClick={handleRunAttack}
                      disabled={isRunning}
                      className="w-full"
                      size="lg"
                    >
                      {isRunning ? (
                        <>
                          <div className="animate-spin mr-2 h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play size={16} weight="fill" />
                          Run Attack
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                {result ? (
                  <>
                    <Card className="p-6 bg-card border-border">
                      <h2 className="text-lg font-semibold mb-4">Attack Results</h2>
                      
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Algorithm</div>
                          <div className="text-lg font-semibold">{result.algorithm?.toUpperCase() || 'LLL'}</div>
                        </div>
                        {result.blockSize && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Block Size</div>
                            <div className="text-lg font-semibold">{result.blockSize}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Iterations</div>
                          <div className="text-lg font-semibold">{result.iterations}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Execution Time</div>
                          <div className="text-lg font-semibold">{result.executionTime}ms</div>
                        </div>
                      </div>

                      <Alert className={result.success ? 'border-success bg-success/10' : 'border-muted-foreground/30'}>
                        <AlertDescription className="text-xs">
                          {result.success
                            ? 'Algorithm converged successfully. Reduced basis found.'
                            : 'Algorithm completed but may not have fully converged.'}
                        </AlertDescription>
                      </Alert>
                    </Card>

                    <VectorDisplay
                      matrix={result.reducedBasis}
                      title="Reduced Basis"
                      highlightFirst={true}
                      success={result.success}
                    />

                    {result.solutionVector && (
                      <VectorDisplay
                        matrix={[result.solutionVector]}
                        title="Shortest Vector (Solution)"
                      />
                    )}
                  </>
                ) : (
                  <Card className="p-6 bg-card border-border">
                    <div className="text-center py-12">
                      <Calculator size={48} className="mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold mb-2">No Results Yet</h3>
                      <p className="text-xs text-muted-foreground">
                        Configure your attack and click "Run Attack" to see results
                      </p>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scanner" className="space-y-6">
            <RPCScanner onAttackGenerated={handleRPCAttackGenerated} />
          </TabsContent>

          <TabsContent value="visualization" className="space-y-6">
            {visualizationSteps.length > 0 ? (
              <>
                <VectorVisualization 
                  steps={visualizationSteps}
                  dimension={visualizationSteps[0]?.basis[0]?.length || 0}
                  onStepChange={setCurrentVisualizationStep}
                />
                
                <div className="grid lg:grid-cols-2 gap-6">
                  <MatrixHeatmap 
                    steps={visualizationSteps}
                    currentStep={currentVisualizationStep}
                  />
                  <OrthogonalityChart steps={visualizationSteps} />
                </div>
              </>
            ) : (
              <Card className="p-6 bg-card border-border">
                <div className="text-center py-12">
                  <ChartLine size={48} className="mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold mb-2">No Visualization Data</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Enable "Capture visualization steps" and run an attack to see animated transformations
                  </p>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card className="p-6 bg-card border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Attack History</h2>
                {(attackHistory?.length || 0) > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearHistory}
                  >
                    Clear History
                  </Button>
                )}
              </div>

              {(attackHistory?.length || 0) === 0 ? (
                <div className="text-center py-12">
                  <ListBullets size={48} className="mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold mb-2">No Attack History</h3>
                  <p className="text-xs text-muted-foreground">
                    Run your first attack to start building history
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-4">
                    {(attackHistory || []).map((history, idx) => (
                      <AttackCard
                        key={history.config.id + idx}
                        history={history}
                        onRerun={handleRerun}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="help" className="space-y-6">
            <Card className="p-6 bg-card border-border">
              <h2 className="text-lg font-semibold mb-4">About LLL & BKZ Algorithms</h2>
              <div className="space-y-4 text-sm">
                <p>
                  The <strong>Lenstra-Lenstra-Lovász (LLL)</strong> algorithm is a polynomial-time lattice basis 
                  reduction algorithm that finds a "reduced" basis with relatively short, nearly orthogonal vectors.
                  <strong> BKZ (Block Korkine-Zolotarev)</strong> extends LLL with block-wise processing for stronger reduction.
                </p>
                
                <Separator />
                
                <div>
                  <h3 className="font-semibold mb-2">How They Work</h3>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li><strong>LLL:</strong> Iteratively reduces vectors using Gram-Schmidt orthogonalization and swaps</li>
                    <li><strong>BKZ:</strong> Applies LLL to local blocks + SVP enumeration for better reduction</li>
                    <li>Both produce bases with shorter, more orthogonal vectors</li>
                    <li>BKZ provides stronger guarantees but requires more computation</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-2">Applications in Cryptography</h3>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li><strong>RSA:</strong> Attack small public exponents or factorization problems</li>
                    <li><strong>Subset Sum:</strong> Solve NP-complete problems with low density</li>
                    <li><strong>Knapsack:</strong> Break Merkle-Hellman and similar cryptosystems</li>
                    <li><strong>Hidden Number Problem:</strong> Recover secret keys from partial information</li>
                    <li><strong>ECDSA/DSA:</strong> Exploit nonce reuse or bias in signature schemes</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-2">Algorithm Selection</h3>
                  <p className="text-muted-foreground mb-2">
                    Choose the appropriate algorithm for your attack:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li><strong>LLL (δ=0.75):</strong> Fast, good for most attacks and learning</li>
                    <li><strong>LLL (δ=0.99):</strong> Better reduction, still fast enough for practice</li>
                    <li><strong>BKZ (block=10):</strong> Stronger reduction, good balance of speed/quality</li>
                    <li><strong>BKZ (block=20+):</strong> Highest quality, use for challenging problems</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-2">Input Format</h3>
                  <p className="text-muted-foreground mb-2">
                    Enter your lattice basis as a matrix, one row per line. Separate values with spaces or commas:
                  </p>
                  <div className="bg-secondary/50 p-3 rounded font-mono text-xs">
                    1 2 3<br />
                    4 5 6<br />
                    7 8 9
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-card border-border">
              <h2 className="text-lg font-semibold mb-4">RPC Signature Scanner</h2>
              <div className="space-y-4 text-sm">
                <p>
                  The RPC Scanner connects to Ethereum-compatible blockchain nodes to analyze transaction signatures 
                  for cryptographic weaknesses. It automatically detects vulnerabilities and generates attack configurations.
                </p>
                
                <Separator />
                
                <div>
                  <h3 className="font-semibold mb-2">Detected Weaknesses</h3>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li><strong>Nonce Reuse (Critical):</strong> Same k used in multiple signatures - private key recoverable</li>
                    <li><strong>Biased Nonces (High):</strong> Non-random k values reveal patterns exploitable via HNP</li>
                    <li><strong>Similar k Values (High):</strong> Close nonce values indicate weak RNG</li>
                    <li><strong>Small r Values (Critical):</strong> Extremely small r suggests implementation errors</li>
                    <li><strong>High s Values (Low):</strong> Non-canonical signatures (normalization issue)</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-2">Using the Scanner</h3>
                  <div className="space-y-2 text-muted-foreground">
                    <p>1. Enter your RPC endpoint URL (Infura, Alchemy, or local node)</p>
                    <p>2. Specify block range to scan (max 1000 blocks per scan)</p>
                    <p>3. Click "Scan for Weak Signatures"</p>
                    <p>4. Review detected weaknesses and severity ratings</p>
                    <p>5. Click "Generate Attack Configuration" to auto-create lattice</p>
                    <p>6. Switch to Attack tab and run the generated configuration</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-2">Attack Generation</h3>
                  <p className="text-muted-foreground">
                    For each detected weakness, the scanner automatically constructs an appropriate lattice basis 
                    that can be used to recover private keys or exploit the vulnerability. Nonce reuse attacks 
                    allow direct key recovery, while biased nonces require Hidden Number Problem (HNP) lattice reduction.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-card border-border">
              <h2 className="text-lg font-semibold mb-4">Quick Start</h2>
              <div className="space-y-3 text-sm">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    1
                  </div>
                  <div>
                    <strong>Choose a Template:</strong> Click "Templates" to load a pre-configured attack example
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    2
                  </div>
                  <div>
                    <strong>Scan RPC (Optional):</strong> Use RPC Scanner to detect real weak signatures and auto-generate attacks
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    3
                  </div>
                  <div>
                    <strong>Configure Attack:</strong> Select algorithm (LLL/BKZ), adjust parameters, and set block size if using BKZ
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    4
                  </div>
                  <div>
                    <strong>Run Attack:</strong> Click "Run Attack" to execute the lattice reduction
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    5
                  </div>
                  <div>
                    <strong>Analyze Results:</strong> View the reduced basis, solution vector, and visualizations
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <TemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onSelectTemplate={handleTemplateSelect}
      />
    </div>
  )
}

export default App
