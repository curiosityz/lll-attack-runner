import { useState, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { UploadSimple, FileText, Database, CheckCircle, XCircle, Warning } from '@phosphor-icons/react'
import { parseTransactionData, type ParseResult, type ParsedSignature } from '@/lib/dataParser'
import { toast } from 'sonner'

interface DataUploadProps {
  onDataParsed: (signatures: ParsedSignature[], parseResult: ParseResult) => void
}

export function DataUpload({ onDataParsed }: DataUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [progress, setProgress] = useState(0)
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
      await processFile(files[0])
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      await processFile(files[0])
    }
  }

  const processFile = async (file: File) => {
    setIsProcessing(true)
    setProgress(10)
    setParseResult(null)

    try {
      const text = await file.text()
      setProgress(40)

      await new Promise(resolve => setTimeout(resolve, 100))

      const result = parseTransactionData(text)
      setProgress(80)

      await new Promise(resolve => setTimeout(resolve, 100))

      setParseResult(result)
      setProgress(100)

      if (result.totalParsed > 0) {
        toast.success(`Parsed ${result.totalParsed} signatures`, {
          description: `Format: ${result.format.toUpperCase()} | ${result.parseErrors.length} errors`
        })
        onDataParsed(result.signatures, result)
      } else {
        toast.error('No valid signatures found', {
          description: 'Check the format guide and try again'
        })
      }
    } catch (error) {
      toast.error('Failed to process file', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
      setParseResult({
        signatures: [],
        transactions: [],
        format: 'unknown',
        totalParsed: 0,
        parseErrors: [error instanceof Error ? error.message : 'Unknown error']
      })
    } finally {
      setIsProcessing(false)
      setTimeout(() => setProgress(0), 1000)
    }
  }

  const handleClickUpload = () => {
    fileInputRef.current?.click()
  }

  const formatExample = {
    json: `[
  {
    "hash": "0x123...",
    "from": "0xabc...",
    "r": "0x456...",
    "s": "0x789...",
    "v": 27,
    "blockNumber": 12345678
  }
]`,
    csv: `hash,from,to,r,s,v,blockNumber
0x123...,0xabc...,0xdef...,0x456...,0x789...,27,12345678`,
    text: `Transaction: 0x123...
From: 0xabc...
r: 0x456...
s: 0x789...
v: 27`
  }

  return (
    <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
          <span className="w-1 h-6 bg-accent rounded-full"></span>
          Upload Transaction Data
        </h2>
        <p className="text-sm text-muted-foreground">
          Drop your signature dump file or paste data below. Supports JSON, CSV, and text formats.
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
          accept=".json,.csv,.txt,.log"
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
            <UploadSimple 
              size={48} 
              weight="duotone" 
              className={isDragging ? 'text-accent' : 'text-muted-foreground'}
            />
          </div>

          <div>
            <h3 className="text-lg font-bold mb-1">
              {isDragging ? 'Drop file here' : 'Drop file or click to upload'}
            </h3>
            <p className="text-sm text-muted-foreground">
              JSON, CSV, or text format • Max 50MB
            </p>
          </div>

          <div className="flex gap-2">
            <Badge variant="secondary" className="bg-secondary/50">
              <FileText size={14} weight="duotone" className="mr-1" />
              .json
            </Badge>
            <Badge variant="secondary" className="bg-secondary/50">
              <FileText size={14} weight="duotone" className="mr-1" />
              .csv
            </Badge>
            <Badge variant="secondary" className="bg-secondary/50">
              <FileText size={14} weight="duotone" className="mr-1" />
              .txt
            </Badge>
          </div>
        </div>
      </div>

      {isProcessing && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Processing...</span>
            <span className="text-sm text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {parseResult && (
        <div className="mt-6 space-y-4">
          <Alert className={
            parseResult.totalParsed > 0 
              ? 'border-success/50 bg-success/10' 
              : 'border-destructive/50 bg-destructive/10'
          }>
            <AlertDescription className="flex items-center gap-2">
              {parseResult.totalParsed > 0 ? (
                <>
                  <CheckCircle size={18} weight="fill" className="text-success" />
                  <span className="font-medium">
                    Successfully parsed {parseResult.totalParsed} signatures
                  </span>
                </>
              ) : (
                <>
                  <XCircle size={18} weight="fill" className="text-destructive" />
                  <span className="font-medium">
                    No valid signatures found
                  </span>
                </>
              )}
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
              <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Format</div>
              <div className="text-lg font-bold text-accent">{parseResult.format.toUpperCase()}</div>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
              <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Parsed</div>
              <div className="text-lg font-bold text-foreground">{parseResult.totalParsed}</div>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
              <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Errors</div>
              <div className="text-lg font-bold text-warning">{parseResult.parseErrors.length}</div>
            </div>
          </div>

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
          Format Examples
        </h3>

        <Tabs defaultValue="json" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto p-1">
            <TabsTrigger value="json" className="text-xs py-1.5">JSON</TabsTrigger>
            <TabsTrigger value="csv" className="text-xs py-1.5">CSV</TabsTrigger>
            <TabsTrigger value="text" className="text-xs py-1.5">Text</TabsTrigger>
          </TabsList>

          <TabsContent value="json" className="mt-3">
            <div className="p-3 rounded-lg bg-secondary/50 border border-border/40">
              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto">
                {formatExample.json}
              </pre>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Flexible JSON with support for nested fields like signature.r, sig.s, etc.
            </p>
          </TabsContent>

          <TabsContent value="csv" className="mt-3">
            <div className="p-3 rounded-lg bg-secondary/50 border border-border/40">
              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto">
                {formatExample.csv}
              </pre>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              CSV with header row. Required: r, s columns. Optional: v, hash, from, to, blockNumber
            </p>
          </TabsContent>

          <TabsContent value="text" className="mt-3">
            <div className="p-3 rounded-lg bg-secondary/50 border border-border/40">
              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto">
                {formatExample.text}
              </pre>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Plain text with labels or just hex values. Parser extracts r and s automatically.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  )
}
