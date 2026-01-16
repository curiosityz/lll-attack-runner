/**
 * Blockchair Data Import Component
 * 
 * Provides a UI for importing Blockchair Bitcoin data dumps from the Loyce Club mirror.
 * Features:
 * - Date range selection (2009-2026)
 * - Data type selection (outputs, inputs, transactions)
 * - Parallel download with progress tracking
 * - IndexedDB-based local storage for data persistence
 * - R, S extraction and Z calculation
 * - URL list import from dl-urls.txt
 */

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  CloudArrowDown,
  Database,
  Lightning,
  CheckCircle,
  XCircle,
  Warning,
  ArrowsClockwise,
  Play,
  Stop,
  FileText,
  CalendarBlank,
  HardDrive,
  MagnifyingGlass,
  ListBullets
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  importBlockchairData,
  getDefaultDateRange,
  estimateFileCount,
  DataType,
  ImportOptions,
  importFromUrlList,
  parseUrlListFile
} from '@/lib/blockchair-importer'
import { ImportProgress, ImportStats } from '@/lib/duckdb-client'
import { initializeDuckDB, getDuckDBClient } from '@/lib/duckdb-client'

// Valid data types for import
const VALID_DATA_TYPES: DataType[] = ['outputs', 'inputs', 'transactions']

interface BlockchairDataImportProps {
  className?: string
  onImportComplete?: (stats: ImportStats) => void
}

interface FileProgress {
  type: DataType
  date: string
  status: ImportProgress['status']
  progress: number
  rowsImported?: number
  error?: string
}

export function BlockchairDataImport({ className, onImportComplete }: BlockchairDataImportProps) {
  // Date range state
  const defaultRange = getDefaultDateRange()
  const [startDate, setStartDate] = useState(defaultRange.startDate.toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(defaultRange.endDate.toISOString().split('T')[0])
  
  // Data type selection
  const [importOutputs, setImportOutputs] = useState(true)
  const [importInputs, setImportInputs] = useState(true)
  const [importTransactions, setImportTransactions] = useState(true)
  
  // Options
  const [concurrency, setConcurrency] = useState(5)
  const [extractSignatures, setExtractSignatures] = useState(true)
  const [calculateZ, setCalculateZ] = useState(true)
  
  // Import state
  const [isImporting, setIsImporting] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [fileProgress, setFileProgress] = useState<Map<string, FileProgress>>(new Map())
  const [recentProgress, setRecentProgress] = useState<FileProgress[]>([])
  const [urlListInfo, setUrlListInfo] = useState<{ totalUrls: number; byType: Record<string, number> } | null>(null)
  const [urlListContent, setUrlListContent] = useState<string | null>(null)
  
  // Database state
  const [isDbReady, setIsDbReady] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)
  const [tableCounts, setTableCounts] = useState<{
    outputs: number
    inputs: number
    transactions: number
    signatures: number
  } | null>(null)
  
  // Initialize IndexedDB on mount
  useEffect(() => {
    const init = async () => {
      try {
        await initializeDuckDB()
        setIsDbReady(true)
        await updateTableCounts()
        
        // Fetch and parse dl-urls.txt file info
        try {
          const response = await fetch('/dl-urls.txt')
          if (response.ok) {
            const content = await response.text()
            setUrlListContent(content) // Cache content for later use
            
            const parsed = parseUrlListFile(content)
            // Filter out 'blocks' and 'unknown' types and count only valid data types
            const validUrls = parsed.filter(item => VALID_DATA_TYPES.includes(item.dataType as DataType))
            const byType = validUrls.reduce((acc, item) => {
              acc[item.dataType] = (acc[item.dataType] || 0) + 1
              return acc
            }, {} as Record<string, number>)
            
            setUrlListInfo({ 
              totalUrls: validUrls.length, 
              byType 
            })
          }
        } catch (error) {
          console.warn('Could not fetch dl-urls.txt:', error)
        }
      } catch (error) {
        setDbError(error instanceof Error ? error.message : 'Failed to initialize database')
      }
    }
    init()
  }, [])
  
  const updateTableCounts = async () => {
    try {
      const db = getDuckDBClient()
      if (db.isReady()) {
        const counts = await db.getTableCounts()
        setTableCounts(counts)
      }
    } catch (error) {
      console.error('Failed to get table counts:', error)
    }
  }
  
  // Calculate estimated file count
  const getSelectedDataTypes = (): DataType[] => {
    const types: DataType[] = []
    if (importOutputs) types.push('outputs')
    if (importInputs) types.push('inputs')
    if (importTransactions) types.push('transactions')
    return types
  }
  
  const estimatedFiles = estimateFileCount(
    getSelectedDataTypes(),
    {
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    }
  )
  
  // Handle progress updates
  const handleProgress = useCallback((progress: ImportProgress) => {
    const key = `${progress.type}-${progress.date}`
    
    setFileProgress(prev => {
      const next = new Map(prev)
      next.set(key, {
        type: progress.type,
        date: progress.date,
        status: progress.status,
        progress: progress.progress,
        rowsImported: progress.rowsImported,
        error: progress.error
      })
      return next
    })
    
    // Keep track of recent progress for display
    setRecentProgress(prev => {
      const existing = prev.findIndex(p => p.type === progress.type && p.date === progress.date)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = {
          type: progress.type,
          date: progress.date,
          status: progress.status,
          progress: progress.progress,
          rowsImported: progress.rowsImported,
          error: progress.error
        }
        return next
      }
      // Keep only last 20 items
      const next = [...prev, {
        type: progress.type,
        date: progress.date,
        status: progress.status,
        progress: progress.progress,
        rowsImported: progress.rowsImported,
        error: progress.error
      }]
      if (next.length > 20) {
        return next.slice(-20)
      }
      return next
    })
  }, [])
  
  // Handle stats updates
  const handleStats = useCallback((newStats: ImportStats) => {
    setStats(newStats)
  }, [])
  
  // Start import
  const startImport = async () => {
    const dataTypes = getSelectedDataTypes()
    
    if (dataTypes.length === 0) {
      toast.error('Please select at least one data type to import')
      return
    }
    
    if (!isDbReady) {
      toast.error('Database is not ready. Please wait for initialization.')
      return
    }
    
    setIsImporting(true)
    setIsPaused(false)
    setFileProgress(new Map())
    setRecentProgress([])
    setStats(null)
    
    try {
      const options: ImportOptions = {
        dataTypes,
        dateRange: {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        },
        concurrency,
        onProgress: handleProgress,
        onStats: handleStats,
        extractSignatures,
        calculateZ
      }
      
      const finalStats = await importBlockchairData(options)
      setStats(finalStats)
      
      await updateTableCounts()
      
      toast.success(`Import complete! ${finalStats.totalRows.toLocaleString()} rows imported.`)
      onImportComplete?.(finalStats)
    } catch (error) {
      toast.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsImporting(false)
    }
  }
  
  // Start import from URL list
  const startImportFromUrlList = async () => {
    const dataTypes = getSelectedDataTypes()
    
    if (dataTypes.length === 0) {
      toast.error('Please select at least one data type to import')
      return
    }
    
    if (!isDbReady) {
      toast.error('Database is not ready. Please wait for initialization.')
      return
    }
    
    setIsImporting(true)
    setIsPaused(false)
    setFileProgress(new Map())
    setRecentProgress([])
    setStats(null)
    
    try {
      let content = urlListContent
      
      // If content is not cached, fetch it
      if (!content) {
        toast.info('Fetching URL list...')
        const response = await fetch('/dl-urls.txt')
        if (!response.ok) {
          throw new Error('Failed to fetch dl-urls.txt')
        }
        content = await response.text()
        setUrlListContent(content) // Cache for future use
      }
      
      const finalStats = await importFromUrlList(content, {
        dataTypes,
        onProgress: handleProgress,
        onStats: handleStats,
        concurrency
      })
      
      setStats(finalStats)
      
      await updateTableCounts()
      
      toast.success(`Import complete! ${finalStats.totalRows.toLocaleString()} rows imported.`)
      onImportComplete?.(finalStats)
    } catch (error) {
      toast.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsImporting(false)
    }
  }
  
  // Calculate overall progress
  const overallProgress = stats ? Math.round((stats.completedFiles / stats.totalFiles) * 100) : 0
  
  // Format elapsed time
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
  
  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
  
  // Get status color
  const getStatusColor = (status: ImportProgress['status']): string => {
    switch (status) {
      case 'complete': return 'text-success'
      case 'error': return 'text-destructive'
      case 'downloading': return 'text-primary'
      case 'importing': return 'text-accent'
      default: return 'text-muted-foreground'
    }
  }
  
  // Get status icon
  const getStatusIcon = (status: ImportProgress['status']) => {
    switch (status) {
      case 'complete': return <CheckCircle size={14} className="text-success" weight="duotone" />
      case 'error': return <XCircle size={14} className="text-destructive" weight="duotone" />
      case 'downloading': return <CloudArrowDown size={14} className="text-primary animate-pulse" />
      case 'importing': return <Database size={14} className="text-accent animate-pulse" />
      case 'decompressing': return <ArrowsClockwise size={14} className="text-warning animate-spin" />
      default: return <FileText size={14} className="text-muted-foreground" />
    }
  }
  
  return (
    <Card className={`p-6 bg-card/80 backdrop-blur-sm border-border/60 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <CloudArrowDown size={20} weight="duotone" className="text-primary" />
          Blockchair Data Import
        </h3>
        <div className="flex items-center gap-2">
          {isDbReady ? (
            <Badge variant="outline" className="border-success/50 text-success">
              <Database size={12} className="mr-1" />
              IndexedDB Ready
            </Badge>
          ) : dbError ? (
            <Badge variant="outline" className="border-destructive/50 text-destructive">
              <XCircle size={12} className="mr-1" />
              DB Error
            </Badge>
          ) : (
            <Badge variant="outline" className="border-primary/50 text-primary">
              <ArrowsClockwise size={12} className="mr-1 animate-spin" />
              Initializing...
            </Badge>
          )}
        </div>
      </div>
      
      {/* DB Error Alert */}
      {dbError && (
        <Alert className="mb-4 border-destructive/50 bg-destructive/10">
          <XCircle size={16} className="text-destructive" />
          <AlertDescription>
            Database initialization failed: {dbError}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Table Counts */}
      {tableCounts && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <div className="text-xl font-bold text-primary">{tableCounts.outputs.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Outputs</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <div className="text-xl font-bold text-accent">{tableCounts.inputs.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Inputs</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <div className="text-xl font-bold text-success">{tableCounts.transactions.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Transactions</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <div className="text-xl font-bold text-warning">{tableCounts.signatures.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Signatures</div>
          </div>
        </div>
      )}
      
      <Separator className="my-4" />
      
      {/* Date Range Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <Label htmlFor="start-date" className="text-sm font-medium mb-2 block">
            <CalendarBlank size={14} className="inline mr-1" />
            Start Date
          </Label>
          <Input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            min="2009-01-03"
            max={endDate}
            disabled={isImporting}
          />
        </div>
        <div>
          <Label htmlFor="end-date" className="text-sm font-medium mb-2 block">
            <CalendarBlank size={14} className="inline mr-1" />
            End Date
          </Label>
          <Input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate}
            disabled={isImporting}
          />
        </div>
      </div>
      
      {/* Data Type Selection */}
      <div className="mb-4">
        <Label className="text-sm font-medium mb-2 block">Data Types</Label>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={importOutputs}
              onCheckedChange={(checked) => setImportOutputs(!!checked)}
              disabled={isImporting}
            />
            <span className="text-sm">Outputs</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={importInputs}
              onCheckedChange={(checked) => setImportInputs(!!checked)}
              disabled={isImporting}
            />
            <span className="text-sm">Inputs</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={importTransactions}
              onCheckedChange={(checked) => setImportTransactions(!!checked)}
              disabled={isImporting}
            />
            <span className="text-sm">Transactions</span>
          </label>
        </div>
      </div>
      
      {/* Options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <Label htmlFor="concurrency" className="text-sm font-medium mb-2 block">
            Parallel Downloads
          </Label>
          <Input
            id="concurrency"
            type="number"
            min={1}
            max={20}
            value={concurrency}
            onChange={(e) => setConcurrency(parseInt(e.target.value) || 5)}
            disabled={isImporting}
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={extractSignatures}
              onCheckedChange={(checked) => setExtractSignatures(!!checked)}
              disabled={isImporting}
            />
            <span className="text-sm">Extract R, S Signatures</span>
          </label>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={calculateZ}
              onCheckedChange={(checked) => setCalculateZ(!!checked)}
              disabled={isImporting}
            />
            <span className="text-sm">Calculate Z (Message Hash)</span>
          </label>
        </div>
      </div>
      
      {/* Estimated Files */}
      <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border/30">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            <FileText size={14} className="inline mr-1" />
            Estimated files to download: <strong>{estimatedFiles.toLocaleString()}</strong>
          </div>
          <div className="text-xs text-muted-foreground">
            ~{Math.round(estimatedFiles * 0.5)} MB compressed
          </div>
        </div>
      </div>
      
      {/* URL List Import Option */}
      {urlListInfo && (
        <div className="mb-4 p-4 rounded-lg bg-accent/10 border border-accent/30">
          <div className="flex items-start gap-3">
            <ListBullets size={20} className="text-accent mt-0.5 flex-shrink-0" weight="duotone" />
            <div className="flex-1">
              <div className="font-semibold text-sm mb-2">Import from Local URL List</div>
              <p className="text-xs text-muted-foreground mb-3">
                Found <strong>dl-urls.txt</strong> with {urlListInfo.totalUrls.toLocaleString()} URLs ready to import:
              </p>
              <div className="flex gap-3 text-xs mb-3">
                {urlListInfo.byType.outputs && (
                  <div className="px-2 py-1 bg-primary/20 rounded">
                    <strong>{urlListInfo.byType.outputs.toLocaleString()}</strong> outputs
                  </div>
                )}
                {urlListInfo.byType.inputs && (
                  <div className="px-2 py-1 bg-accent/20 rounded">
                    <strong>{urlListInfo.byType.inputs.toLocaleString()}</strong> inputs
                  </div>
                )}
                {urlListInfo.byType.transactions && (
                  <div className="px-2 py-1 bg-success/20 rounded">
                    <strong>{urlListInfo.byType.transactions.toLocaleString()}</strong> transactions
                  </div>
                )}
              </div>
              <Button
                onClick={startImportFromUrlList}
                disabled={isImporting || !isDbReady || getSelectedDataTypes().length === 0}
                variant="outline"
                size="sm"
                className="border-accent/50 hover:bg-accent/10"
              >
                <ListBullets size={16} weight="duotone" />
                Import from URL List
              </Button>
            </div>
          </div>
        </div>
      )}
      
      <Separator className="my-4" />
      
      {/* Action Buttons */}
      <div className="flex gap-3 mb-4">
        <Button
          onClick={startImport}
          disabled={isImporting || !isDbReady || getSelectedDataTypes().length === 0}
          className="bg-primary hover:bg-primary/90"
        >
          {isImporting ? (
            <>
              <ArrowsClockwise size={16} className="animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Play size={16} weight="duotone" />
              Start Import
            </>
          )}
        </Button>
        
        {isImporting && (
          <Button
            variant="outline"
            onClick={() => setIsPaused(!isPaused)}
            className="border-warning/30 hover:bg-warning/10"
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
        
        <Button
          variant="outline"
          onClick={updateTableCounts}
          disabled={!isDbReady}
        >
          <MagnifyingGlass size={16} />
          Refresh Counts
        </Button>
      </div>
      
      {/* Progress Section */}
      {(isImporting || stats) && (
        <>
          <Separator className="my-4" />
          
          {/* Overall Progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm text-muted-foreground">
                {stats?.completedFiles || 0} / {stats?.totalFiles || estimatedFiles} files
              </span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>
          
          {/* Stats Grid */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-card/50 border border-border/50">
                <div className="text-xl font-bold text-primary">{stats.totalRows.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Rows Imported</div>
              </div>
              <div className="p-3 rounded-lg bg-card/50 border border-border/50">
                <div className="text-xl font-bold text-accent">{formatBytes(stats.bytesDownloaded)}</div>
                <div className="text-xs text-muted-foreground">Downloaded</div>
              </div>
              <div className="p-3 rounded-lg bg-card/50 border border-border/50">
                <div className="text-xl font-bold text-success">{formatElapsedTime(stats.elapsedMs)}</div>
                <div className="text-xs text-muted-foreground">Elapsed Time</div>
              </div>
              <div className="p-3 rounded-lg bg-card/50 border border-border/50">
                <div className="text-xl font-bold text-destructive">{stats.errors.length}</div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
            </div>
          )}
          
          {/* Recent File Progress */}
          <div className="mb-4">
            <Label className="text-sm font-medium mb-2 block">Recent Activity</Label>
            <ScrollArea className="h-48 rounded-lg border border-border/50 bg-muted/20">
              <div className="p-2 space-y-1">
                {recentProgress.slice().reverse().map((progress, idx) => (
                  <div
                    key={`${progress.type}-${progress.date}-${idx}`}
                    className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-card/30"
                  >
                    {getStatusIcon(progress.status)}
                    <span className="font-mono text-muted-foreground">{progress.date}</span>
                    <Badge variant="outline" className="h-5 text-[10px]">
                      {progress.type}
                    </Badge>
                    <span className={getStatusColor(progress.status)}>
                      {progress.status === 'complete' 
                        ? `${progress.rowsImported?.toLocaleString() || 0} rows`
                        : progress.status}
                    </span>
                    {progress.error && (
                      <span className="text-destructive truncate max-w-32" title={progress.error}>
                        {progress.error}
                      </span>
                    )}
                  </div>
                ))}
                {recentProgress.length === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    No activity yet
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          
          {/* Error List */}
          {stats && stats.errors.length > 0 && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Errors ({stats.errors.length})</Label>
              <ScrollArea className="h-32 rounded-lg border border-destructive/30 bg-destructive/5">
                <div className="p-2 space-y-1">
                  {stats.errors.slice(-20).map((error, idx) => (
                    <div key={idx} className="text-xs text-destructive font-mono">
                      {error}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </>
      )}
      
      {/* Help Text */}
      <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/30">
        <div className="flex items-start gap-2">
          <Lightning size={16} className="text-primary mt-0.5 flex-shrink-0" weight="duotone" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <strong>Data Source:</strong> Blockchair Bitcoin blockchain dumps from{' '}
              <code className="px-1 py-0.5 bg-muted rounded">blockdata.loyce.club</code>
            </p>
            <p>
              <strong>R, S Values:</strong> Extracted from DER-encoded ECDSA signatures in transaction inputs.
            </p>
            <p>
              <strong>Z Value:</strong> The message hash (sighash) calculated from the transaction pre-image.
            </p>
            <p>
              <strong>Tip:</strong> Start with a small date range to test the import process, then expand.
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default BlockchairDataImport
