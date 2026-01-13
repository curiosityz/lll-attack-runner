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
import { Play, Lightbulb, Calculator, ListBullets } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { AttackHistory, AttackType, AttackTemplate } from '@/lib/types'
import { runLLL, parseBasisFromString } from '@/lib/lll'
import { MatrixInput } from '@/components/MatrixInput'
import { VectorDisplay } from '@/components/VectorDisplay'
import { AttackCard } from '@/components/AttackCard'
import { TemplateDialog } from '@/components/TemplateDialog'

function App() {
  const [attackHistory, setAttackHistory] = useKV<AttackHistory[]>('attack-history', [])
  
  const [attackType, setAttackType] = useState<AttackType>('custom')
  const [attackName, setAttackName] = useState('Custom Attack')
  const [basisInput, setBasisInput] = useState('1 2 3\n4 5 6\n7 8 9')
  const [delta, setDelta] = useState('0.75')
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<{
    reducedBasis: number[][]
    iterations: number
    executionTime: number
    success: boolean
    solutionVector?: number[]
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

    await new Promise(resolve => setTimeout(resolve, 100))

    const startTime = performance.now()
    const lllResult = runLLL(basis, deltaValue)
    const endTime = performance.now()

    const executionTime = Math.round(endTime - startTime)

    const newResult = {
      reducedBasis: lllResult.reducedBasis,
      iterations: lllResult.iterations,
      executionTime,
      success: lllResult.success,
      solutionVector: lllResult.solutionVector
    }

    setResult(newResult)
    setIsRunning(false)

    const newHistory: AttackHistory = {
      config: {
        id: Date.now().toString(),
        type: attackType,
        name: attackName,
        basis,
        delta: deltaValue,
        timestamp: Date.now()
      },
      result: {
        configId: Date.now().toString(),
        success: lllResult.success,
        reducedBasis: lllResult.reducedBasis,
        solutionVector: lllResult.solutionVector,
        iterations: lllResult.iterations,
        executionTime,
        timestamp: Date.now()
      }
    }

    setAttackHistory((current) => [newHistory, ...(current || [])].slice(0, 50))

    if (lllResult.success) {
      toast.success('Attack completed successfully!')
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
    toast.success(`Loaded template: ${template.name}`)
  }

  const handleRerun = (history: AttackHistory) => {
    setAttackType(history.config.type)
    setAttackName(history.config.name)
    setBasisInput(history.config.basis.map(row => row.join(' ')).join('\n'))
    setDelta(history.config.delta.toString())
    setResult(null)
    toast.success('Configuration restored')
  }

  const handleClearHistory = () => {
    setAttackHistory([])
    toast.success('History cleared')
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Calculator size={32} className="text-accent" weight="bold" />
            <h1 className="text-3xl font-bold tracking-tight">LLL Attack Runner</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Lattice basis reduction tool for cryptographic analysis
          </p>
        </header>

        <Tabs defaultValue="attack" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="attack">
              <Play size={16} className="mr-2" />
              Attack
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
                        </SelectContent>
                      </Select>
                    </div>

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
              <h2 className="text-lg font-semibold mb-4">About LLL Algorithm</h2>
              <div className="space-y-4 text-sm">
                <p>
                  The <strong>Lenstra-Lenstra-Lovász (LLL)</strong> algorithm is a polynomial-time lattice basis 
                  reduction algorithm that finds a "reduced" basis with relatively short, nearly orthogonal vectors.
                </p>
                
                <Separator />
                
                <div>
                  <h3 className="font-semibold mb-2">How It Works</h3>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Takes a lattice basis (set of vectors) as input</li>
                    <li>Iteratively reduces vectors using Gram-Schmidt orthogonalization</li>
                    <li>Swaps vectors when Lovász condition is violated</li>
                    <li>Produces a basis with shorter, more orthogonal vectors</li>
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
                  </ul>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-2">Delta Parameter</h3>
                  <p className="text-muted-foreground">
                    The delta (δ) parameter controls the quality of reduction. Values closer to 1 produce 
                    better reduced bases but take longer. Common values:
                  </p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                    <li><strong>0.75:</strong> Standard LLL, fast computation</li>
                    <li><strong>0.99:</strong> Better reduction, slower but more accurate</li>
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
                    <strong>Configure Attack:</strong> Adjust the basis matrix, delta parameter, and attack type
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    3
                  </div>
                  <div>
                    <strong>Run Attack:</strong> Click "Run Attack" to execute the LLL algorithm
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    4
                  </div>
                  <div>
                    <strong>Analyze Results:</strong> View the reduced basis and solution vector
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
