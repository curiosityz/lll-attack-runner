import { useState, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  UploadSimple, 
  FileText, 
  Database, 
  CheckCircle, 
  XCircle, 
  Warning,
  Shield,
  Lightning,
  Fingerprint,
  Link
} from '@phosphor-icons/react'
import { 
  parseBlockchairTSV, 
  detectBlockchairFileType,
  convertToAnalyzerFormat,
  BlockchairParseResult,
  ExtractedSignature
} from '@/lib/blockchair-parser'
import { ParsedSignature } from '@/lib/dataParser'
import { toast } from 'sonner'

interface BlockchairUploadProps {
  onSignaturesExtracted: (signatures: ParsedSignature[], rawSignatures: ExtractedSignature[]) => void
}

export function BlockchairUpload({ onSignaturesExtracted }: BlockchairUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [parseResult, setParseResult] = useState<BlockchairParseResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [extractedSignatures, setExtractedSignatures] = useState<ExtractedSignature[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await processFiles(files)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      await processFiles(Array.from(files))
    }
  }

  const processFiles = async (files: File[]) => {
    setIsProcessing(true)
    setProgress(5)
    setProgressText('Reading files...')
    setParseResult(null)
    setExtractedSignatures([])

    const allSignatures: ExtractedSignature[] = []
    let totalInputs = 0
    let totalTransactions = 0
    let successfulExtractions = 0
    let failedExtractions = 0
    const parseErrors: string[] = []
    const vulnerabilities = {
      nonceReuse: 0,
      biasedNonce: 0,
      smallR: 0,
      relatedNonce: 0
    }

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setProgressText(`Processing ${file.name}...`)
        setProgress(10 + (i / files.length) * 60)

        let content: string
        
        // Check if file is gzipped
        if (file.name.endsWith('.gz')) {
          try {
            // Use DecompressionStream API if available and supports gzip
            if ('DecompressionStream' in window) {
              try {
                const stream = file.stream().pipeThrough(new DecompressionStream('gzip'))
                const decompressed = await new Response(stream).text()
                content = decompressed
              } catch (decompressionErr) {
                // DecompressionStream exists but failed - could be unsupported format
                parseErrors.push(`${file.name}: Gzip decompression failed. Please decompress the file manually and re-upload.`)
                continue
              }
            } else {
              parseErrors.push(`${file.name}: Gzip decompression not supported in this browser. Please decompress manually.`)
              continue
            }
          } catch (err) {
            parseErrors.push(`${file.name}: Failed to decompress - ${err instanceof Error ? err.message : 'Unknown error'}`)
            continue
          }
        } else {
          content = await file.text()
        }

        setProgress(10 + (i / files.length) * 60 + 30)

        // Auto-detect file type
        const fileType = detectBlockchairFileType(content)
        
        if (fileType === 'unknown') {
          parseErrors.push(`${file.name}: Unable to detect file type. Expected inputs, outputs, or transactions TSV.`)
          continue
        }

        if (fileType !== 'inputs') {
          parseErrors.push(`${file.name}: Detected as ${fileType} file. Only inputs files contain signatures.`)
          continue
        }

        setProgressText(`Extracting signatures from ${file.name}...`)

        const result = parseBlockchairTSV(content, fileType)
        
        allSignatures.push(...result.signatures)
        totalInputs += result.totalInputs
        totalTransactions += result.totalTransactions
        successfulExtractions += result.successfulExtractions
        failedExtractions += result.failedExtractions
        vulnerabilities.nonceReuse += result.vulnerabilities.nonceReuse
        vulnerabilities.biasedNonce += result.vulnerabilities.biasedNonce
        vulnerabilities.smallR += result.vulnerabilities.smallR
        vulnerabilities.relatedNonce += result.vulnerabilities.relatedNonce
        parseErrors.push(...result.parseErrors.map(e => `${file.name}: ${e}`))
      }

      setProgress(90)
      setProgressText('Analyzing vulnerabilities...')

      await new Promise(resolve => setTimeout(resolve, 100))

      const finalResult: BlockchairParseResult = {
        signatures: allSignatures,
        totalInputs,
        totalTransactions,
        successfulExtractions,
        failedExtractions,
        vulnerabilities,
        parseErrors: parseErrors.slice(0, 50)
      }

      setParseResult(finalResult)
      setExtractedSignatures(allSignatures)
      setProgress(100)
      setProgressText('Complete!')

      if (allSignatures.length > 0) {
        const parsedSigs = convertToAnalyzerFormat(allSignatures)
        onSignaturesExtracted(parsedSigs, allSignatures)
        
        const vulnCount = vulnerabilities.nonceReuse + vulnerabilities.biasedNonce + 
                         vulnerabilities.smallR + vulnerabilities.relatedNonce
        
        toast.success(`Extracted ${allSignatures.length} signatures`, {
          description: vulnCount > 0 
            ? `Found ${vulnCount} potential vulnerabilities!`
            : 'No obvious vulnerabilities detected'
        })
      } else {
        toast.error('No signatures extracted', {
          description: 'Check that you uploaded Blockchair inputs files'
        })
      }
    } catch (error) {
      toast.error('Failed to process files', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
      setParseResult({
        signatures: [],
        totalInputs: 0,
        totalTransactions: 0,
        successfulExtractions: 0,
        failedExtractions: 0,
        vulnerabilities: { nonceReuse: 0, biasedNonce: 0, smallR: 0, relatedNonce: 0 },
        parseErrors: [error instanceof Error ? error.message : 'Unknown error']
      })
    } finally {
      setIsProcessing(false)
      setTimeout(() => {
        setProgress(0)
        setProgressText('')
      }, 2000)
    }
  }

  const handleClickUpload = () => {
    fileInputRef.current?.click()
  }

  return (
    <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
          <span className="w-1 h-6 bg-accent rounded-full"></span>
          Blockchair TSV Import
        </h2>
        <p className="text-sm text-muted-foreground">
          Upload Blockchair Bitcoin dump files (.tsv or .tsv.gz) to extract ECDSA signatures for cryptanalysis.
        </p>
      </div>

      <div
        className={`
          relative border-2 border-dashed rounded-lg p-12 text-center transition-all
          ${isDragging 
            ? 'border-accent bg-accent/10 scale-[1.02]' 
            : 'border-border hover:border-accent/50 hover:bg-accent/5'
          }
          ${isProcessing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
        `}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClickUpload}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".tsv,.gz,.txt"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-4">
          <div className={`
            p-6 rounded-2xl transition-all
            ${isDragging 
              ? 'bg-accent/20 scale-110' 
              : 'bg-muted/30'
            }
          `}>
            <Database 
              size={48} 
              weight="duotone" 
              className={isDragging ? 'text-accent' : 'text-muted-foreground'}
            />
          </div>

          <div>
            <h3 className="text-lg font-bold mb-1">
              {isDragging ? 'Drop Blockchair files here' : 'Upload Blockchair TSV dumps'}
            </h3>
            <p className="text-sm text-muted-foreground">
              Supports .tsv and .tsv.gz files • Multiple files allowed
            </p>
          </div>

          <div className="flex gap-2 flex-wrap justify-center">
            <Badge variant="secondary" className="bg-secondary/50">
              <FileText size={14} weight="duotone" className="mr-1" />
              inputs_*.tsv
            </Badge>
            <Badge variant="secondary" className="bg-secondary/50">
              <FileText size={14} weight="duotone" className="mr-1" />
              outputs_*.tsv
            </Badge>
            <Badge variant="secondary" className="bg-secondary/50">
              <FileText size={14} weight="duotone" className="mr-1" />
              transactions_*.tsv
            </Badge>
          </div>
        </div>
      </div>

      {isProcessing && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{progressText || 'Processing...'}</span>
            <span className="text-sm text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {parseResult && (
        <div className="mt-6 space-y-4">
          <Alert className={
            parseResult.successfulExtractions > 0 
              ? 'border-success/50 bg-success/10' 
              : 'border-destructive/50 bg-destructive/10'
          }>
            <AlertDescription className="flex items-center gap-2">
              {parseResult.successfulExtractions > 0 ? (
                <>
                  <CheckCircle size={18} weight="fill" className="text-success" />
                  <span className="font-medium">
                    Extracted {parseResult.successfulExtractions.toLocaleString()} signatures from {parseResult.totalInputs.toLocaleString()} inputs
                  </span>
                </>
              ) : (
                <>
                  <XCircle size={18} weight="fill" className="text-destructive" />
                  <span className="font-medium">
                    No signatures extracted
                  </span>
                </>
              )}
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
              <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Inputs</div>
              <div className="text-lg font-bold text-foreground">{parseResult.totalInputs.toLocaleString()}</div>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
              <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Signatures</div>
              <div className="text-lg font-bold text-accent">{parseResult.successfulExtractions.toLocaleString()}</div>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
              <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Failed</div>
              <div className="text-lg font-bold text-warning">{parseResult.failedExtractions.toLocaleString()}</div>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
              <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Errors</div>
              <div className="text-lg font-bold text-destructive">{parseResult.parseErrors.length}</div>
            </div>
          </div>

          {/* Vulnerability Summary */}
          {(parseResult.vulnerabilities.nonceReuse > 0 || 
            parseResult.vulnerabilities.biasedNonce > 0 || 
            parseResult.vulnerabilities.smallR > 0 || 
            parseResult.vulnerabilities.relatedNonce > 0) && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={18} weight="duotone" className="text-destructive" />
                <span className="text-sm font-bold text-destructive">Vulnerabilities Detected!</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {parseResult.vulnerabilities.nonceReuse > 0 && (
                  <div className="flex items-center gap-2">
                    <Lightning size={16} className="text-red-500" weight="fill" />
                    <span><strong>{parseResult.vulnerabilities.nonceReuse}</strong> Nonce Reuse</span>
                  </div>
                )}
                {parseResult.vulnerabilities.biasedNonce > 0 && (
                  <div className="flex items-center gap-2">
                    <Fingerprint size={16} className="text-orange-500" weight="fill" />
                    <span><strong>{parseResult.vulnerabilities.biasedNonce}</strong> Biased Nonces</span>
                  </div>
                )}
                {parseResult.vulnerabilities.smallR > 0 && (
                  <div className="flex items-center gap-2">
                    <Warning size={16} className="text-red-600" weight="fill" />
                    <span><strong>{parseResult.vulnerabilities.smallR}</strong> Small R</span>
                  </div>
                )}
                {parseResult.vulnerabilities.relatedNonce > 0 && (
                  <div className="flex items-center gap-2">
                    <Link size={16} className="text-yellow-500" weight="fill" />
                    <span><strong>{parseResult.vulnerabilities.relatedNonce}</strong> Related Nonces</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {parseResult.parseErrors.length > 0 && (
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
              <div className="flex items-center gap-2 mb-2">
                <Warning size={18} weight="duotone" className="text-warning" />
                <span className="text-sm font-semibold">Parse Warnings</span>
              </div>
              <ScrollArea className="h-32">
                <div className="space-y-1 text-xs font-mono">
                  {parseResult.parseErrors.slice(0, 20).map((error, idx) => (
                    <div key={idx} className="text-muted-foreground">
                      {error}
                    </div>
                  ))}
                  {parseResult.parseErrors.length > 20 && (
                    <div className="text-muted-foreground italic">
                      ... and {parseResult.parseErrors.length - 20} more
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      )}

      <Separator className="my-6" />

      <div>
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Database size={16} weight="duotone" />
          Blockchair Data Sources
        </h3>

        <Tabs defaultValue="about" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto p-1">
            <TabsTrigger value="about" className="text-xs py-1.5">About</TabsTrigger>
            <TabsTrigger value="download" className="text-xs py-1.5">Downloads</TabsTrigger>
            <TabsTrigger value="format" className="text-xs py-1.5">TSV Format</TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="mt-3">
            <div className="p-3 rounded-lg bg-secondary/50 border border-border/40 text-sm">
              <p className="mb-2">
                <strong>Blockchair</strong> provides comprehensive Bitcoin blockchain dumps in TSV format.
                These dumps contain all transaction inputs with their signature data.
              </p>
              <p className="text-muted-foreground">
                This tool extracts R, S values from DER-encoded signatures and flags potential
                cryptographic vulnerabilities like nonce reuse, biased nonces, and weak RNG patterns.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="download" className="mt-3">
            <div className="p-3 rounded-lg bg-secondary/50 border border-border/40 text-sm space-y-2">
              <p className="font-medium">Download Blockchair dumps from:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>
                  <code className="bg-muted px-1 rounded">blockdata.loyce.club/inputs/</code>
                </li>
                <li>
                  <code className="bg-muted px-1 rounded">blockdata.loyce.club/outputs/</code>
                </li>
                <li>
                  <code className="bg-muted px-1 rounded">blockdata.loyce.club/transactions/</code>
                </li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                Files are named: blockchair_bitcoin_inputs_YYYYMMDD.tsv.gz
              </p>
            </div>
          </TabsContent>

          <TabsContent value="format" className="mt-3">
            <div className="p-3 rounded-lg bg-secondary/50 border border-border/40">
              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto">
{`# Inputs TSV columns (example):
block_id  transaction_hash  index  time  value  ...
          spending_signature_hex  spending_witness_hex

# Key fields for signature extraction:
- spending_signature_hex: DER-encoded signature (Legacy)
- spending_witness_hex: Witness stack (SegWit)`}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  )
}
