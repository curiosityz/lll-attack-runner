/**
 * SimplifiedWorkflow Component
 * 
 * A clean, unified interface for the LLL Attack Runner with a simple 3-step flow:
 * 1. Upload signatures (drag & drop)
 * 2. One-click attack with automatic strategy
 * 3. View results
 * 
 * This replaces the confusing multi-tab interface with a streamlined experience.
 */

import { useState, useCallback, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  UploadSimple,
  Play, 
  Stop,
  Lightning, 
  CheckCircle, 
  XCircle, 
  Info,
  Spinner,
  FileText,
  Trash,
  ArrowRight,
  Copy,
  Key
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { ParsedSignature } from '@/lib/dataParser'
import { parseTransactionData, ParseResult } from '@/lib/dataParser'
import { 
  parseBlockchairTSV, 
  detectBlockchairFileType,
  convertToAnalyzerFormat,
  ExtractedSignature
} from '@/lib/blockchair-parser'
import { 
  runAttackOrchestrator, 
  getAttackStrategySummary,
  OrchestratorResult,
  AttackProgress,
  AttackStrategy
} from '@/lib/attack-orchestrator'

const strategyLabels: Record<AttackStrategy, string> = {
  'nonce_reuse': '⚡ Nonce Reuse (Direct)',
  'hnp_standard': '📊 HNP Standard Lattice',
  'hnp_embedded': '🔗 HNP Embedded Lattice',
  'hnp_kannan': '🎯 HNP Kannan Embedding',
  'svp_direct': '📐 Direct SVP',
  'combined': '🔄 Combined Strategy'
}

type WorkflowStep = 'upload' | 'ready' | 'running' | 'complete'

export function SimplifiedWorkflow() {
  const [step, setStep] = useState<WorkflowStep>('upload')
  const [signatures, setSignatures] = useState<ParsedSignature[]>([])
  const [targetAddress, setTargetAddress] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [attackProgress, setAttackProgress] = useState<AttackProgress | null>(null)
  const [result, setResult] = useState<OrchestratorResult | null>(null)
  const [summary, setSummary] = useState<ReturnType<typeof getAttackStrategySummary> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle file upload
  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true)
    setUploadProgress(10)

    try {
      let content: string
      
      // Handle gzip files
      if (file.name.endsWith('.gz')) {
        if ('DecompressionStream' in window) {
          try {
            const stream = file.stream().pipeThrough(new DecompressionStream('gzip'))
            content = await new Response(stream).text()
          } catch {
            toast.error('Failed to decompress file', {
              description: 'Please decompress .gz files manually before uploading'
            })
            setIsProcessing(false)
            return
          }
        } else {
          toast.error('Browser does not support gzip decompression', {
            description: 'Please decompress .gz files manually (use gunzip or similar)'
          })
          setIsProcessing(false)
          return
        }
      } else {
        content = await file.text()
      }
      
      setUploadProgress(50)
      
      let parsedSignatures: ParsedSignature[] = []
      
      // Try Blockchair TSV format first
      const fileType = detectBlockchairFileType(content)
      if (fileType === 'inputs') {
        const result = parseBlockchairTSV(content, fileType)
        parsedSignatures = convertToAnalyzerFormat(result.signatures)
        
        if (result.vulnerabilities.nonceReuse > 0) {
          toast.success(`🔓 ${result.vulnerabilities.nonceReuse} nonce reuse vulnerabilities found!`)
        }
      } else {
        // Try generic format
        const result = parseTransactionData(content)
        parsedSignatures = result.signatures
      }
      
      setUploadProgress(100)
      
      if (parsedSignatures.length > 0) {
        setSignatures(prev => [...prev, ...parsedSignatures])
        
        // Analyze for attack strategy
        const allSigs = [...signatures, ...parsedSignatures]
        const analysis = getAttackStrategySummary(allSigs)
        setSummary(analysis)
        
        setStep('ready')
        toast.success(`Loaded ${parsedSignatures.length} signatures`, {
          description: `Total: ${signatures.length + parsedSignatures.length} signatures ready`
        })
      } else {
        toast.error('No valid signatures found in file')
      }
    } catch (error) {
      toast.error('Failed to process file', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsProcessing(false)
      setUploadProgress(0)
    }
  }, [signatures])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      await processFile(file)
    }
  }, [processFile])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      for (const file of Array.from(files)) {
        await processFile(file)
      }
    }
  }, [processFile])

  const clearSignatures = useCallback(() => {
    setSignatures([])
    setSummary(null)
    setResult(null)
    setStep('upload')
    toast.info('Signatures cleared')
  }, [])

  // Run attack
  const runAttack = useCallback(async () => {
    if (signatures.length === 0) {
      toast.error('No signatures loaded')
      return
    }

    setStep('running')
    setResult(null)
    setAttackProgress({
      phase: 'analyzing',
      message: 'Starting attack...',
      progress: 0
    })

    try {
      const attackResult = await runAttackOrchestrator(signatures, {
        targetAddress: targetAddress || undefined,
        maxAttempts: 5,
        enableRetry: true,
        usePrecision: true,
        onProgress: (p) => setAttackProgress(p)
      })

      setResult(attackResult)
      setStep('complete')

      if (attackResult.success && attackResult.privateKeyHex) {
        toast.success('🎉 VICTORY! Private key recovered!', {
          description: 'Key has been successfully extracted',
          duration: 10000
        })
      } else {
        toast.warning('Attack completed without finding key', {
          description: attackResult.recommendations?.[0] || 'Try with more signatures'
        })
      }
    } catch (error) {
      toast.error('Attack failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
      setStep('ready')
    }
  }, [signatures, targetAddress])

  const stopAttack = useCallback(() => {
    setStep('ready')
    setAttackProgress(null)
    toast.info('Attack stopped')
  }, [])

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard!')
    } catch {
      // Fallback for older browsers or permission denied
      toast.error('Failed to copy', {
        description: 'Please select and copy manually'
      })
    }
  }, [])

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center py-6">
        <div className="inline-flex p-4 bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl border border-primary/30 mb-4">
          <Key size={48} className="text-primary" weight="duotone" />
        </div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent">
          ECDSA Key Recovery
        </h1>
        <p className="text-muted-foreground mt-2">
          Upload signatures → Run attack → Extract key
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4 mb-8">
        <StepIndicator 
          number={1} 
          label="Upload" 
          active={step === 'upload' || step === 'ready'}
          complete={signatures.length > 0}
        />
        <ArrowRight className="text-muted-foreground" />
        <StepIndicator 
          number={2} 
          label="Attack" 
          active={step === 'running'}
          complete={step === 'complete'}
        />
        <ArrowRight className="text-muted-foreground" />
        <StepIndicator 
          number={3} 
          label="Results" 
          active={step === 'complete'}
          complete={result?.success ?? false}
        />
      </div>

      {/* Upload Section */}
      {(step === 'upload' || step === 'ready') && (
        <Card className="p-6 bg-card/80 border-border/60">
          <div
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center transition-all
              ${isDragging ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'}
              ${isProcessing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
            `}
            onDragEnter={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.txt,.tsv,.gz"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="flex flex-col items-center gap-3">
              <div className={`p-4 rounded-xl ${isDragging ? 'bg-accent/20' : 'bg-muted/30'}`}>
                <UploadSimple size={36} className={isDragging ? 'text-accent' : 'text-muted-foreground'} />
              </div>
              <div>
                <h3 className="font-bold">Drop signature files here</h3>
                <p className="text-sm text-muted-foreground">
                  JSON, CSV, TSV, or Blockchair dumps • Multiple files OK
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">.json</Badge>
                <Badge variant="secondary">.csv</Badge>
                <Badge variant="secondary">.tsv</Badge>
                <Badge variant="secondary">.tsv.gz</Badge>
              </div>
            </div>
          </div>

          {isProcessing && (
            <Progress value={uploadProgress} className="mt-4 h-2" />
          )}

          {/* Loaded Signatures Summary */}
          {signatures.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="default" className="text-lg px-4 py-1">
                    {signatures.length} signatures
                  </Badge>
                  {summary?.analysis.hasNonceReuse && (
                    <Badge variant="destructive" className="animate-pulse">
                      ⚡ Nonce reuse detected!
                    </Badge>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={clearSignatures}>
                  <Trash size={16} />
                  Clear
                </Button>
              </div>

              {/* Attack Strategy Summary */}
              {summary && (
                <Alert className={
                  summary.analysis.hasNonceReuse 
                    ? 'border-success/50 bg-success/10' 
                    : summary.dimensionInfo.isValid 
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-warning/50 bg-warning/10'
                }>
                  <AlertDescription className="text-sm">
                    {summary.analysis.hasNonceReuse ? (
                      <span className="font-bold text-success">
                        ⚡ Direct key recovery possible via nonce reuse!
                      </span>
                    ) : summary.dimensionInfo.isValid ? (
                      <span>
                        ✓ Ready for <strong>{summary.analysis.recommendedStrategy}</strong> attack 
                        ({summary.dimensionInfo.selectedDimension}D lattice)
                      </span>
                    ) : (
                      <span className="text-warning">
                        ⚠️ {summary.dimensionInfo.insufficientDataReason}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Target Address */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Target Address (optional)
                </Label>
                <Input
                  value={targetAddress}
                  onChange={(e) => setTargetAddress(e.target.value)}
                  placeholder="Bitcoin or Ethereum address for validation"
                  className="font-mono text-xs"
                />
              </div>

              {/* Attack Button */}
              <Button
                onClick={runAttack}
                disabled={signatures.length === 0}
                className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-lg py-6"
                size="lg"
              >
                <Lightning size={24} weight="fill" />
                Run Attack
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Running State */}
      {step === 'running' && attackProgress && (
        <Card className="p-8 bg-card/80 border-border/60">
          <div className="text-center mb-6">
            <Spinner size={48} className="animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-xl font-bold">{attackProgress.message}</h2>
            {attackProgress.currentStrategy && (
              <p className="text-muted-foreground mt-2">
                Strategy: {strategyLabels[attackProgress.currentStrategy]}
              </p>
            )}
            {attackProgress.attemptNumber && attackProgress.totalAttempts && (
              <p className="text-sm text-muted-foreground">
                Attempt {attackProgress.attemptNumber} of {attackProgress.totalAttempts}
              </p>
            )}
          </div>
          
          <Progress value={attackProgress.progress} className="h-3 mb-6" />
          
          <Button onClick={stopAttack} variant="outline" className="w-full">
            <Stop size={20} />
            Stop Attack
          </Button>
        </Card>
      )}

      {/* Results */}
      {step === 'complete' && result && (
        <Card className={`p-8 border-2 ${
          result.success 
            ? 'bg-gradient-to-br from-success/20 to-accent/20 border-success/60' 
            : 'bg-card/80 border-border/60'
        }`}>
          <div className="text-center mb-6">
            {result.success ? (
              <>
                <CheckCircle size={64} weight="fill" className="text-success mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-success">🎉 Key Found!</h2>
              </>
            ) : (
              <>
                <XCircle size={64} weight="duotone" className="text-muted-foreground mx-auto mb-4" />
                <h2 className="text-2xl font-bold">Key Not Found</h2>
              </>
            )}
            <p className="text-muted-foreground mt-2">
              {strategyLabels[result.strategy]} • {result.attempts.length} attempt(s) • {Math.round(result.totalExecutionTimeMs)}ms
            </p>
          </div>

          {result.success && result.privateKeyHex && (
            <div className="space-y-4">
              <div className="p-4 bg-card/80 rounded-lg border border-success/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground uppercase">Private Key (Hex)</span>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.privateKeyHex!)}>
                    <Copy size={14} />
                  </Button>
                </div>
                <div className="font-mono text-sm break-all text-success">
                  {result.privateKeyHex}
                </div>
              </div>

              {result.privateKeyWIF && (
                <div className="p-4 bg-card/80 rounded-lg border border-success/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground uppercase">WIF Format</span>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.privateKeyWIF!)}>
                      <Copy size={14} />
                    </Button>
                  </div>
                  <div className="font-mono text-sm break-all text-success">
                    {result.privateKeyWIF}
                  </div>
                </div>
              )}
            </div>
          )}

          {!result.success && result.recommendations && (
            <div className="space-y-2 mt-4">
              <h4 className="font-bold text-sm">Recommendations:</h4>
              {result.recommendations.map((rec, i) => (
                <Alert key={i} className="py-2">
                  <AlertDescription className="text-xs">{rec}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          <Separator className="my-6" />

          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={() => { setStep('ready'); setResult(null) }}
              className="flex-1"
            >
              Try Again
            </Button>
            <Button 
              variant="outline" 
              onClick={clearSignatures}
              className="flex-1"
            >
              Start Over
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

// Step indicator component
function StepIndicator({ 
  number, 
  label, 
  active, 
  complete 
}: { 
  number: number
  label: string
  active: boolean
  complete: boolean
}) {
  return (
    <div className={`flex items-center gap-2 ${active ? 'text-primary' : 'text-muted-foreground'}`}>
      <div className={`
        w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
        ${complete ? 'bg-success text-success-foreground' : active ? 'bg-primary text-primary-foreground' : 'bg-muted'}
      `}>
        {complete ? <CheckCircle weight="fill" /> : number}
      </div>
      <span className="font-medium">{label}</span>
    </div>
  )
}
