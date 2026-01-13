import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, Flask } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface TestResult {
  blockNumber: number
  hexValue: string
  success: boolean
  error?: string
  timestamp: number
  duration: number
  hasTransactions: boolean
  transactionCount?: number
}

export function RPCTestUtility() {
  const [rpcUrl, setRpcUrl] = useState('https://eth.llamarpc.com')
  const [testBlocks, setTestBlocks] = useState('21000000,21000100,19000000,20000000')
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<TestResult[]>([])

  const formatBlockToHex = (blockNum: number): string => {
    return '0x' + blockNum.toString(16)
  }

  const testSingleBlock = async (blockNumber: number): Promise<TestResult> => {
    const startTime = performance.now()
    const hexValue = formatBlockToHex(blockNumber)
    
    try {
      console.log(`[Test] Testing block ${blockNumber} -> ${hexValue}`)
      
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: [hexValue, true],
          id: blockNumber
        }),
        signal: AbortSignal.timeout(10000)
      })

      const data = await response.json()
      const duration = performance.now() - startTime

      if (data.error) {
        return {
          blockNumber,
          hexValue,
          success: false,
          error: `${data.error.code}: ${data.error.message}`,
          timestamp: Date.now(),
          duration,
          hasTransactions: false
        }
      }

      const block = data.result
      if (!block) {
        return {
          blockNumber,
          hexValue,
          success: false,
          error: 'Block returned null (may not exist yet)',
          timestamp: Date.now(),
          duration,
          hasTransactions: false
        }
      }

      const txCount = Array.isArray(block.transactions) ? block.transactions.length : 0

      return {
        blockNumber,
        hexValue,
        success: true,
        timestamp: Date.now(),
        duration,
        hasTransactions: txCount > 0,
        transactionCount: txCount
      }
    } catch (error) {
      const duration = performance.now() - startTime
      return {
        blockNumber,
        hexValue,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
        duration,
        hasTransactions: false
      }
    }
  }

  const runTests = async () => {
    setIsRunning(true)
    setResults([])

    const blockNumbers = testBlocks
      .split(',')
      .map(b => parseInt(b.trim()))
      .filter(b => !isNaN(b))

    if (blockNumbers.length === 0) {
      toast.error('No valid block numbers provided')
      setIsRunning(false)
      return
    }

    toast.info(`Testing ${blockNumbers.length} block(s)...`)

    const newResults: TestResult[] = []

    for (const blockNum of blockNumbers) {
      const result = await testSingleBlock(blockNum)
      newResults.push(result)
      setResults([...newResults])
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const successCount = newResults.filter(r => r.success).length
    if (successCount === newResults.length) {
      toast.success(`All ${successCount} tests passed!`)
    } else {
      toast.warning(`${successCount}/${newResults.length} tests passed`)
    }

    setIsRunning(false)
  }

  const testLatestBlock = async () => {
    setIsRunning(true)
    
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1
        }),
        signal: AbortSignal.timeout(10000)
      })

      const data = await response.json()
      
      if (data.error) {
        toast.error(`Failed: ${data.error.message}`)
      } else {
        const latestBlock = parseInt(data.result, 16)
        toast.success(`Latest block: ${latestBlock.toLocaleString()}`)
        setTestBlocks(`${latestBlock - 10},${latestBlock - 5},${latestBlock}`)
      }
    } catch (error) {
      toast.error(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center gap-3 mb-4">
        <Flask size={24} className="text-accent" weight="fill" />
        <div>
          <h2 className="text-lg font-semibold">RPC Connection Tester</h2>
          <p className="text-xs text-muted-foreground">
            Test block fetching with different block numbers to verify RPC compatibility
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="test-rpc-url" className="text-sm font-medium mb-2 block">
            RPC Endpoint
          </Label>
          <Input
            id="test-rpc-url"
            value={rpcUrl}
            onChange={(e) => setRpcUrl(e.target.value)}
            placeholder="https://eth.llamarpc.com"
            disabled={isRunning}
          />
        </div>

        <div>
          <Label htmlFor="test-blocks" className="text-sm font-medium mb-2 block">
            Block Numbers (comma-separated)
          </Label>
          <Input
            id="test-blocks"
            value={testBlocks}
            onChange={(e) => setTestBlocks(e.target.value)}
            placeholder="21000000,21000100,19000000"
            disabled={isRunning}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Try blocks from different ranges to test hex formatting
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={runTests}
            disabled={isRunning}
            className="flex-1"
          >
            {isRunning ? (
              <>
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                Testing...
              </>
            ) : (
              <>
                <Flask size={16} weight="fill" />
                Run Tests
              </>
            )}
          </Button>
          <Button
            onClick={testLatestBlock}
            disabled={isRunning}
            variant="outline"
          >
            Get Latest Block
          </Button>
        </div>

        {results.length > 0 && (
          <>
            <Alert className="mt-4">
              <AlertDescription className="text-xs">
                <div className="flex items-center justify-between">
                  <span>
                    <strong>Results:</strong> {results.filter(r => r.success).length}/{results.length} passed
                  </span>
                  <span className="text-muted-foreground">
                    Avg: {Math.round(results.reduce((acc, r) => acc + r.duration, 0) / results.length)}ms
                  </span>
                </div>
              </AlertDescription>
            </Alert>

            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {results.map((result, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded border ${
                      result.success
                        ? 'bg-success/5 border-success/20'
                        : 'bg-destructive/5 border-destructive/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {result.success ? (
                          <CheckCircle size={16} weight="fill" className="text-success flex-shrink-0" />
                        ) : (
                          <XCircle size={16} weight="fill" className="text-destructive flex-shrink-0" />
                        )}
                        <div>
                          <div className="text-sm font-medium font-mono">
                            Block {result.blockNumber.toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            Hex: {result.hexValue}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground text-right">
                        {Math.round(result.duration)}ms
                      </div>
                    </div>

                    {result.success ? (
                      <div className="flex gap-2 items-center">
                        <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">
                          Success
                        </Badge>
                        {result.hasTransactions && (
                          <Badge variant="outline" className="text-xs">
                            {result.transactionCount} tx
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-destructive mt-1">
                        {result.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </Card>
  )
}
