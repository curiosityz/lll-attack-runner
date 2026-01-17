/**
 * URL List Stream to Cloudflare D1 Component
 * 
 * Downloads files from dl-urls.txt and streams extracted signatures
 * directly to Cloudflare D1 database.
 * 
 * Features:
 * - Parses URL list from dl-urls.txt
 * - Downloads and decompresses .tsv.gz files
 * - Extracts ECDSA signatures from inputs files
 * - Streams directly to Cloudflare D1
 * - Progress tracking and error handling
 */

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CloudArrowUp,
  Database,
  Lightning,
  CheckCircle,
  XCircle,
  Warning,
  ArrowsClockwise,
  Play,
  Stop,
  ListBullets,
  CloudArrowDown
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import pako from 'pako'
import {
  parseBlockchairTSV,
  detectBlockchairFileType,
  ExtractedSignature
} from '@/lib/blockchair-parser'
import { getDatabaseClient } from '@/lib/database-client'
import { fetchWithCORSProxy } from '@/lib/cors-proxy'
import { parseUrlListFile, DataType } from '@/lib/blockchair-importer'

interface StreamStats {
  totalUrls: number
  processedUrls: number
  signaturesExtracted: number
  signaturesStreamed: number
  vulnerabilitiesFound: number
  errors: string[]
  skippedFiles: number
  startTime: number
  elapsedMs: number
}

// Constants for limits
const MAX_RECENT_FILES = 20
const MAX_ERRORS_STORED = 50

interface FileStatus {
  url: string
  status: 'pending' | 'downloading' | 'processing' | 'streaming' | 'complete' | 'error' | 'skipped'
  progress: number
  signatures?: number
  error?: string
}

export function UrlListStreamToD1() {
  const [urlListInfo, setUrlListInfo] = useState<{ 
    totalUrls: number
    byType: Record<string, number>
    urls: { url: string; dataType: string; date?: string }[]
  } | null>(null)
  
  const [isStreaming, setIsStreaming] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [stats, setStats] = useState<StreamStats | null>(null)
  const [recentFiles, setRecentFiles] = useState<FileStatus[]>([])
  const [dbConnected, setDbConnected] = useState(false)
  
  // Options
  const [streamInputs, setStreamInputs] = useState(true)
  const [streamOutputs, setStreamOutputs] = useState(false)
  const [streamTransactions, setStreamTransactions] = useState(false)
  const [concurrency, setConcurrency] = useState(3)
  const [maxFiles, setMaxFiles] = useState(0) // 0 = unlimited
  
  // Initialize and check D1 connection
  useEffect(() => {
    const init = async () => {
      // Check D1 connection
      const dbClient = getDatabaseClient()
      const config = dbClient.getConfig()
      
      if (config.type === 'cloudflare-d1' && config.accountId && config.databaseId && config.apiToken) {
        const testResult = await dbClient.testConnection()
        setDbConnected(testResult.success)
        if (!testResult.success) {
          toast.error('Cloudflare D1 not connected', { 
            description: 'Configure D1 in Database Streaming panel first.' 
          })
        }
      }
      
      // Fetch and parse dl-urls.txt
      try {
        const response = await fetch('/dl-urls.txt')
        if (response.ok) {
          const content = await response.text()
          const parsed = parseUrlListFile(content)
          
          // Filter and count by type
          const byType = parsed.reduce((acc, item) => {
            if (['inputs', 'outputs', 'transactions'].includes(item.dataType)) {
              acc[item.dataType] = (acc[item.dataType] || 0) + 1
            }
            return acc
          }, {} as Record<string, number>)
          
          const validUrls = parsed.filter(item => 
            ['inputs', 'outputs', 'transactions'].includes(item.dataType)
          )
          
          setUrlListInfo({
            totalUrls: validUrls.length,
            byType,
            urls: validUrls
          })
        }
      } catch (error) {
        console.warn('Could not fetch dl-urls.txt:', error)
      }
    }
    
    init()
  }, [])
  
  // Get selected data types
  const getSelectedTypes = (): string[] => {
    const types: string[] = []
    if (streamInputs) types.push('inputs')
    if (streamOutputs) types.push('outputs')
    if (streamTransactions) types.push('transactions')
    return types
  }
  
  // Calculate files to process
  const getFilesToProcess = () => {
    if (!urlListInfo) return []
    
    const selectedTypes = getSelectedTypes()
    let filtered = urlListInfo.urls.filter(u => selectedTypes.includes(u.dataType))
    
    // Apply maxFiles limit if set
    if (maxFiles > 0) {
      filtered = filtered.slice(0, maxFiles)
    }
    
    return filtered
  }
  
  // Download and decompress a single file
  const downloadFile = async (url: string): Promise<string> => {
    const response = await fetchWithCORSProxy(url)
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('FILE_NOT_FOUND')
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const arrayBuffer = await response.arrayBuffer()
    
    // Decompress if gzipped
    if (url.endsWith('.gz')) {
      const decompressed = pako.ungzip(new Uint8Array(arrayBuffer), { to: 'string' })
      return decompressed
    }
    
    return new TextDecoder().decode(arrayBuffer)
  }
  
  // Process a single file and extract signatures
  const processFile = async (
    url: string, 
    dataType: string,
    updateStatus: (status: Partial<FileStatus>) => void
  ): Promise<ExtractedSignature[]> => {
    updateStatus({ status: 'downloading', progress: 10 })
    
    let content: string
    try {
      content = await downloadFile(url)
    } catch (error) {
      if (error instanceof Error && error.message === 'FILE_NOT_FOUND') {
        throw new Error('FILE_NOT_FOUND')
      }
      throw error
    }
    
    updateStatus({ status: 'processing', progress: 50 })
    
    // Detect file type if not specified
    const detectedType = detectBlockchairFileType(content)
    const fileType = (dataType === 'inputs' || dataType === 'outputs' || dataType === 'transactions') 
      ? dataType as 'inputs' | 'outputs' | 'transactions'
      : detectedType !== 'unknown' ? detectedType : 'inputs'
    
    // Parse and extract signatures
    const result = parseBlockchairTSV(content, fileType)
    
    updateStatus({ 
      status: 'streaming', 
      progress: 80,
      signatures: result.signatures.length 
    })
    
    return result.signatures
  }
  
  // Main streaming function
  const startStreaming = async () => {
    if (!dbConnected) {
      toast.error('Cloudflare D1 not connected', {
        description: 'Please configure D1 in the Database Streaming panel first.'
      })
      return
    }
    
    const filesToProcess = getFilesToProcess()
    if (filesToProcess.length === 0) {
      toast.error('No files to process', {
        description: 'Select at least one data type with files available.'
      })
      return
    }
    
    setIsStreaming(true)
    setIsPaused(false)
    setRecentFiles([])
    
    const newStats: StreamStats = {
      totalUrls: filesToProcess.length,
      processedUrls: 0,
      signaturesExtracted: 0,
      signaturesStreamed: 0,
      vulnerabilitiesFound: 0,
      errors: [],
      skippedFiles: 0,
      startTime: Date.now(),
      elapsedMs: 0
    }
    setStats(newStats)
    
    const dbClient = getDatabaseClient()
    
    // Process files with controlled concurrency
    const queue = [...filesToProcess]
    const inProgress: Promise<void>[] = []
    
    const processNext = async (): Promise<void> => {
      while (queue.length > 0 && !isPaused) {
        const file = queue.shift()
        if (!file) break
        
        const fileStatus: FileStatus = {
          url: file.url,
          status: 'pending',
          progress: 0
        }
        
        // Add to recent files
        setRecentFiles(prev => {
          const next = [...prev, fileStatus]
          return next.slice(-MAX_RECENT_FILES)
        })
        
        const updateStatus = (update: Partial<FileStatus>) => {
          setRecentFiles(prev => {
            const idx = prev.findIndex(f => f.url === file.url)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], ...update }
              return next
            }
            return prev
          })
        }
        
        try {
          const signatures = await processFile(file.url, file.dataType, updateStatus)
          
          if (signatures.length > 0) {
            // Stream to D1
            const streamResult = await dbClient.streamSignatures(signatures)
            
            // Count vulnerabilities
            let vulnCount = 0
            for (const sig of signatures) {
              vulnCount += sig.vulnerabilities.length
            }
            
            // Update stats
            setStats(prev => {
              if (!prev) return prev
              return {
                ...prev,
                processedUrls: prev.processedUrls + 1,
                signaturesExtracted: prev.signaturesExtracted + signatures.length,
                signaturesStreamed: prev.signaturesStreamed + streamResult.count,
                vulnerabilitiesFound: prev.vulnerabilitiesFound + vulnCount,
                elapsedMs: Date.now() - prev.startTime
              }
            })
            
            updateStatus({ 
              status: 'complete', 
              progress: 100,
              signatures: streamResult.count
            })
          } else {
            // No signatures (e.g., outputs or transactions files)
            updateStatus({ status: 'complete', progress: 100, signatures: 0 })
            setStats(prev => {
              if (!prev) return prev
              return {
                ...prev,
                processedUrls: prev.processedUrls + 1,
                elapsedMs: Date.now() - prev.startTime
              }
            })
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          
          if (errorMsg === 'FILE_NOT_FOUND') {
            // File doesn't exist - skip silently
            updateStatus({ status: 'skipped', progress: 100 })
            setStats(prev => {
              if (!prev) return prev
              return {
                ...prev,
                processedUrls: prev.processedUrls + 1,
                skippedFiles: prev.skippedFiles + 1,
                elapsedMs: Date.now() - prev.startTime
              }
            })
          } else {
            updateStatus({ status: 'error', progress: 0, error: errorMsg })
            setStats(prev => {
              if (!prev) return prev
              return {
                ...prev,
                processedUrls: prev.processedUrls + 1,
                errors: [...prev.errors.slice(-MAX_ERRORS_STORED), `${file.url}: ${errorMsg}`],
                elapsedMs: Date.now() - prev.startTime
              }
            })
          }
        }
      }
    }
    
    // Start concurrent workers
    for (let i = 0; i < concurrency; i++) {
      inProgress.push(processNext())
    }
    
    await Promise.all(inProgress)
    
    // Final stats update and completion toast
    setStats(prev => {
      if (!prev) return prev
      const finalStats = {
        ...prev,
        elapsedMs: Date.now() - prev.startTime
      }
      // Show completion toast with final stats
      toast.success('Streaming complete!', {
        description: `${finalStats.signaturesStreamed.toLocaleString()} signatures streamed to Cloudflare D1`
      })
      return finalStats
    })
    
    setIsStreaming(false)
  }
  
  // Format helpers
  const formatElapsedTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }
  
  const getStatusIcon = (status: FileStatus['status']) => {
    switch (status) {
      case 'complete': return <CheckCircle size={14} className="text-success" weight="duotone" />
      case 'error': return <XCircle size={14} className="text-destructive" weight="duotone" />
      case 'downloading': return <CloudArrowDown size={14} className="text-primary animate-pulse" />
      case 'processing': return <ArrowsClockwise size={14} className="text-warning animate-spin" />
      case 'streaming': return <CloudArrowUp size={14} className="text-accent animate-pulse" />
      case 'skipped': return <Warning size={14} className="text-muted-foreground" />
      default: return <ListBullets size={14} className="text-muted-foreground" />
    }
  }
  
  const getStatusColor = (status: FileStatus['status']): string => {
    switch (status) {
      case 'complete': return 'text-success'
      case 'error': return 'text-destructive'
      case 'skipped': return 'text-muted-foreground'
      default: return 'text-primary'
    }
  }
  
  const overallProgress = stats ? Math.round((stats.processedUrls / stats.totalUrls) * 100) : 0
  
  return (
    <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <CloudArrowUp size={28} weight="duotone" className="text-blue-500" />
          <div>
            <h2 className="text-lg font-bold">Stream URLs to Cloudflare D1</h2>
            <p className="text-sm text-muted-foreground">
              Download files from dl-urls.txt and stream signatures to D1
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dbConnected ? (
            <Badge variant="outline" className="border-success/50 text-success">
              <Database size={12} className="mr-1" />
              D1 Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="border-destructive/50 text-destructive">
              <XCircle size={12} className="mr-1" />
              D1 Not Connected
            </Badge>
          )}
        </div>
      </div>
      
      {!dbConnected && (
        <Alert className="mb-4 border-warning/50 bg-warning/10">
          <Warning size={16} className="text-warning" />
          <AlertDescription>
            Configure Cloudflare D1 in the Database Streaming panel below to enable streaming.
          </AlertDescription>
        </Alert>
      )}
      
      {/* URL List Info */}
      {urlListInfo && (
        <div className="mb-4 p-4 rounded-lg bg-muted/30 border border-border/30">
          <div className="flex items-center gap-2 mb-3">
            <ListBullets size={18} className="text-primary" weight="duotone" />
            <span className="font-semibold">Available URLs in dl-urls.txt</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-2 rounded bg-accent/20 text-center">
              <div className="text-lg font-bold text-accent">
                {(urlListInfo.byType.inputs || 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Inputs</div>
            </div>
            <div className="p-2 rounded bg-primary/20 text-center">
              <div className="text-lg font-bold text-primary">
                {(urlListInfo.byType.outputs || 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Outputs</div>
            </div>
            <div className="p-2 rounded bg-success/20 text-center">
              <div className="text-lg font-bold text-success">
                {(urlListInfo.byType.transactions || 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Transactions</div>
            </div>
          </div>
        </div>
      )}
      
      <Separator className="my-4" />
      
      {/* Options */}
      <div className="space-y-4 mb-4">
        <div>
          <Label className="text-sm font-medium mb-2 block">Data Types to Stream</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={streamInputs}
                onCheckedChange={(checked) => setStreamInputs(!!checked)}
                disabled={isStreaming}
              />
              <span className="text-sm">Inputs (signatures)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={streamOutputs}
                onCheckedChange={(checked) => setStreamOutputs(!!checked)}
                disabled={isStreaming}
              />
              <span className="text-sm">Outputs</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={streamTransactions}
                onCheckedChange={(checked) => setStreamTransactions(!!checked)}
                disabled={isStreaming}
              />
              <span className="text-sm">Transactions</span>
            </label>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="concurrency" className="text-sm font-medium mb-2 block">
              Concurrent Downloads
            </Label>
            <Input
              id="concurrency"
              type="number"
              min={1}
              max={10}
              value={concurrency}
              onChange={(e) => setConcurrency(parseInt(e.target.value) || 3)}
              disabled={isStreaming}
            />
          </div>
          <div>
            <Label htmlFor="maxFiles" className="text-sm font-medium mb-2 block">
              Max Files (0 = unlimited)
            </Label>
            <Input
              id="maxFiles"
              type="number"
              min={0}
              value={maxFiles}
              onChange={(e) => setMaxFiles(parseInt(e.target.value) || 0)}
              disabled={isStreaming}
            />
          </div>
        </div>
      </div>
      
      {/* Files to process preview */}
      <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border/30">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Files to process: <strong>{getFilesToProcess().length.toLocaleString()}</strong>
          </span>
          <span className="text-xs text-muted-foreground">
            {streamInputs && 'Inputs contain signatures for extraction'}
          </span>
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="flex gap-3 mb-4">
        <Button
          onClick={startStreaming}
          disabled={isStreaming || !dbConnected || getSelectedTypes().length === 0}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isStreaming ? (
            <>
              <ArrowsClockwise size={16} className="animate-spin" />
              Streaming...
            </>
          ) : (
            <>
              <Play size={16} weight="duotone" />
              Start Streaming to D1
            </>
          )}
        </Button>
        
        {isStreaming && (
          <Button
            variant="outline"
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? (
              <>
                <Play size={16} />
                Resume
              </>
            ) : (
              <>
                <Stop size={16} />
                Pause
              </>
            )}
          </Button>
        )}
      </div>
      
      {/* Progress Section */}
      {stats && (
        <>
          <Separator className="my-4" />
          
          {/* Overall Progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm text-muted-foreground">
                {stats.processedUrls} / {stats.totalUrls} files
              </span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-card/50 border border-border/50">
              <div className="text-xl font-bold text-primary">
                {stats.signaturesExtracted.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Extracted</div>
            </div>
            <div className="p-3 rounded-lg bg-card/50 border border-border/50">
              <div className="text-xl font-bold text-blue-500">
                {stats.signaturesStreamed.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Streamed to D1</div>
            </div>
            <div className="p-3 rounded-lg bg-card/50 border border-border/50">
              <div className="text-xl font-bold text-warning">
                {stats.vulnerabilitiesFound.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Vulnerabilities</div>
            </div>
            <div className="p-3 rounded-lg bg-card/50 border border-border/50">
              <div className="text-xl font-bold text-success">
                {formatElapsedTime(stats.elapsedMs)}
              </div>
              <div className="text-xs text-muted-foreground">Elapsed</div>
            </div>
          </div>
          
          {/* Recent File Progress */}
          <div className="mb-4">
            <Label className="text-sm font-medium mb-2 block">Recent Activity</Label>
            <ScrollArea className="h-40 rounded-lg border border-border/50 bg-muted/20">
              <div className="p-2 space-y-1">
                {recentFiles.slice().reverse().map((file, idx) => (
                  <div
                    key={`${file.url}-${idx}`}
                    className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-card/30"
                  >
                    {getStatusIcon(file.status)}
                    <span className="font-mono text-muted-foreground truncate max-w-48" title={file.url}>
                      {file.url.split('/').pop()}
                    </span>
                    <span className={getStatusColor(file.status)}>
                      {file.status === 'complete' && file.signatures !== undefined
                        ? `${file.signatures} sigs`
                        : file.status}
                    </span>
                    {file.error && (
                      <span className="text-destructive truncate max-w-24" title={file.error}>
                        {file.error}
                      </span>
                    )}
                  </div>
                ))}
                {recentFiles.length === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    No activity yet
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          
          {/* Error/Skip Summary */}
          {(stats.errors.length > 0 || stats.skippedFiles > 0) && (
            <div className="text-xs text-muted-foreground">
              {stats.skippedFiles > 0 && (
                <span className="mr-3">Skipped (404): {stats.skippedFiles}</span>
              )}
              {stats.errors.length > 0 && (
                <span className="text-destructive">Errors: {stats.errors.length}</span>
              )}
            </div>
          )}
        </>
      )}
      
      {/* Help Text */}
      <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/30">
        <div className="flex items-start gap-2">
          <Lightning size={16} className="text-blue-500 mt-0.5 flex-shrink-0" weight="duotone" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <strong>Important:</strong> Only <strong>inputs</strong> files contain ECDSA signatures.
              Outputs and transactions files provide context data but no extractable signatures.
            </p>
            <p>
              <strong>Tip:</strong> Start with a small batch (set Max Files) to test the connection,
              then process larger batches.
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
