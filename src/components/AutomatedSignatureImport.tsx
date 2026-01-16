/**
 * Automated Signature Import Component
 * 
 * Simplified one-click import that automatically:
 * 1. Detects file type (inputs/outputs/transactions)
 * 2. Parses and extracts signatures with DER sighash
 * 3. Tags weak/flawed nonces
 * 4. Streams directly to Cloudflare D1
 */

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { 
  CloudArrowUp, 
  FileArrowUp, 
  CheckCircle, 
  Warning,
  Lightning,
  Database
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { 
  parseBlockchairTSV,
  detectBlockchairFileType,
  ExtractedSignature
} from '@/lib/blockchair-parser'
import { getDatabaseClient } from '@/lib/database-client'
import pako from 'pako'

interface AutoImportProps {
  onImportComplete?: (signatures: ExtractedSignature[]) => void
}

export function AutomatedSignatureImport({ onImportComplete }: AutoImportProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [stats, setStats] = useState<{
    filesProcessed: number
    signaturesExtracted: number
    vulnerabilitiesFound: number
    streamedToDatabase: number
  } | null>(null)

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setIsProcessing(true)
    setProgress(0)
    setStats(null)

    try {
      const dbClient = getDatabaseClient()
      const allSignatures: ExtractedSignature[] = []
      let totalVulnerabilities = 0

      // Process all files
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setStatusMessage(`Processing ${file.name}...`)
        setProgress((i / files.length) * 90)

        // Read file
        const arrayBuffer = await file.arrayBuffer()
        let content: string

        // Decompress if .gz
        if (file.name.endsWith('.gz')) {
          setStatusMessage(`Decompressing ${file.name}...`)
          const decompressed = pako.ungzip(new Uint8Array(arrayBuffer), { to: 'string' })
          content = decompressed
        } else {
          content = new TextDecoder().decode(arrayBuffer)
        }

        // Auto-detect file type
        setStatusMessage(`Analyzing ${file.name}...`)
        const fileType = detectBlockchairFileType(content)

        if (fileType === 'unknown') {
          toast.error(`Could not detect type of ${file.name}`, {
            description: 'File must be a Blockchair inputs, outputs, or transactions TSV'
          })
          continue
        }

        // Parse file
        setStatusMessage(`Extracting signatures from ${file.name}...`)
        const parseResult = parseBlockchairTSV(content, fileType)

        if (parseResult.signatures.length > 0) {
          allSignatures.push(...parseResult.signatures)
          totalVulnerabilities += 
            parseResult.vulnerabilities.nonceReuse +
            parseResult.vulnerabilities.biasedNonce +
            parseResult.vulnerabilities.smallR +
            parseResult.vulnerabilities.relatedNonce

          toast.success(`Extracted ${parseResult.signatures.length} signatures from ${file.name}`, {
            description: `Found ${parseResult.vulnerabilities.nonceReuse} nonce reuse, ${parseResult.vulnerabilities.biasedNonce} biased nonces`
          })
        }
      }

      // Stream to Cloudflare D1
      if (allSignatures.length > 0) {
        setStatusMessage('Streaming to Cloudflare D1...')
        setProgress(95)

        const streamResult = await dbClient.streamSignatures(allSignatures)

        if (streamResult.success) {
          setStats({
            filesProcessed: files.length,
            signaturesExtracted: allSignatures.length,
            vulnerabilitiesFound: totalVulnerabilities,
            streamedToDatabase: streamResult.count
          })

          toast.success('Import complete!', {
            description: `${streamResult.count} signatures stored in Cloudflare D1`
          })

          if (onImportComplete) {
            onImportComplete(allSignatures)
          }
        } else {
          toast.error('Database streaming failed', {
            description: streamResult.errors.join(', ')
          })
        }
      }

      setProgress(100)
      setStatusMessage('Complete!')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Import failed', { description: message })
      console.error('Import error:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/20">
      <div className="flex items-center gap-3 mb-6">
        <CloudArrowUp size={32} weight="duotone" className="text-blue-500" />
        <div>
          <h2 className="text-xl font-bold">Automated Signature Import</h2>
          <p className="text-sm text-muted-foreground">
            One-click import to Cloudflare D1 with automatic vulnerability detection
          </p>
        </div>
      </div>

      {/* Upload Area */}
      <div className="mb-6">
        <label
          htmlFor="auto-file-upload"
          className={`
            flex flex-col items-center justify-center
            border-2 border-dashed rounded-lg p-8 cursor-pointer
            transition-colors
            ${isProcessing 
              ? 'border-blue-500/30 bg-blue-500/5 cursor-not-allowed' 
              : 'border-blue-500/50 hover:border-blue-500 hover:bg-blue-500/10'
            }
          `}
        >
          <FileArrowUp size={48} weight="duotone" className="text-blue-500 mb-4" />
          <span className="text-lg font-medium mb-2">
            {isProcessing ? 'Processing...' : 'Drop files or click to upload'}
          </span>
          <span className="text-sm text-muted-foreground mb-4">
            Supports TSV and TSV.GZ files (inputs, outputs, transactions)
          </span>
          <input
            id="auto-file-upload"
            type="file"
            multiple
            accept=".tsv,.tsv.gz,.gz"
            onChange={handleFileSelect}
            disabled={isProcessing}
            className="hidden"
          />
        </label>
      </div>

      {/* Processing Status */}
      {isProcessing && (
        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{statusMessage}</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {/* Results */}
      {stats && (
        <Alert className="border-success/50 bg-success/10 mb-6">
          <CheckCircle size={20} className="text-success" weight="duotone" />
          <AlertDescription>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
              <div>
                <div className="text-2xl font-bold text-success">{stats.filesProcessed}</div>
                <div className="text-xs text-muted-foreground">Files Processed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-success">{stats.signaturesExtracted}</div>
                <div className="text-xs text-muted-foreground">Signatures Extracted</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-warning">{stats.vulnerabilitiesFound}</div>
                <div className="text-xs text-muted-foreground">Vulnerabilities Found</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-500">{stats.streamedToDatabase}</div>
                <div className="text-xs text-muted-foreground">Stored in D1</div>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-card/50">
          <Lightning size={20} className="text-yellow-500 mt-0.5" weight="duotone" />
          <div className="flex-1">
            <div className="font-medium text-sm">Auto-Detection</div>
            <div className="text-xs text-muted-foreground">
              Automatically identifies file type and extracts signatures
            </div>
          </div>
        </div>
        
        <div className="flex items-start gap-3 p-3 rounded-lg bg-card/50">
          <Warning size={20} className="text-orange-500 mt-0.5" weight="duotone" />
          <div className="flex-1">
            <div className="font-medium text-sm">Smart Tagging</div>
            <div className="text-xs text-muted-foreground">
              Detects nonce reuse, biased nonces, and weak signatures
            </div>
          </div>
        </div>
        
        <div className="flex items-start gap-3 p-3 rounded-lg bg-card/50">
          <Database size={20} className="text-blue-500 mt-0.5" weight="duotone" />
          <div className="flex-1">
            <div className="font-medium text-sm">Direct Streaming</div>
            <div className="text-xs text-muted-foreground">
              Streams directly to Cloudflare D1 with DER sighash extraction
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
