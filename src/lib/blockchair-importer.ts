/**
 * Blockchair Data Importer
 * 
 * This module handles downloading and importing Blockchair Bitcoin data dumps
 * from the Loyce Club mirror into DuckDB for analysis.
 * 
 * Features:
 * - Parallel file downloads for speed
 * - Streaming decompression of gzipped TSV files
 * - Progress tracking for each file
 * - Date range specification (2009-2026)
 * - Integration with DuckDB for data storage
 * - R, S extraction and Z calculation
 * - Smart error handling: gracefully skips missing files (404), retries transient errors
 */

import { getDuckDBClient, DuckDBClient, ImportProgress, ImportStats } from './duckdb-client'
import {
  parseInputsTSV,
  parseOutputsTSV,
  parseTransactionsTSV,
  extractSignaturesFromInputs,
  analyzeSignaturesForVulnerabilities
} from './blockchair-parser'

// ============================================================================
// Types and Constants
// ============================================================================

export type DataType = 'outputs' | 'inputs' | 'transactions'

export interface DateRange {
  startDate: Date
  endDate: Date
}

export interface ImportOptions {
  dataTypes: DataType[]
  dateRange: DateRange
  concurrency: number // Number of parallel downloads
  onProgress?: (progress: ImportProgress) => void
  onStats?: (stats: ImportStats) => void
  extractSignatures?: boolean
  calculateZ?: boolean
}

const BASE_URL = 'http://blockdata.loyce.club'

// URL patterns for different data types
const URL_PATTERNS: Record<DataType, (date: string) => string> = {
  outputs: (date) => `${BASE_URL}/outputs/blockchair_bitcoin_outputs_${date}.tsv.gz`,
  inputs: (date) => `${BASE_URL}/inputs/blockchair_bitcoin_inputs_${date}.tsv.gz`,
  transactions: (date) => `${BASE_URL}/transactions/blockchair_bitcoin_transactions_${date}.tsv.gz`
}

// Special URL for block metadata
const BLOCKS_URL = `${BASE_URL}/block_hash_version_versionHex_merkleroot_time_mediantime_nonce_bits_difficulty_chainwork_nTx_strippedsize_size_weight.tsv.gz`

// Bitcoin genesis block date
const BITCOIN_START_DATE = new Date('2009-01-03')

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Format a date as YYYYMMDD for URL construction
 */
function formatDateForUrl(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * Generate all dates between start and end (inclusive)
 */
function generateDateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = []
  const current = new Date(start)
  
  while (current <= end) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  
  return dates
}

/**
 * Get the default date range (2009-01-03 to today or specified end date)
 * Note: The end date defaults to the current date to avoid requiring code updates
 */
export function getDefaultDateRange(): DateRange {
  // Use current date as default end, but cap at a reasonable future date
  const today = new Date()
  const maxEndDate = new Date('2030-12-31')
  const endDate = today < maxEndDate ? today : maxEndDate
  
  return {
    startDate: BITCOIN_START_DATE,
    endDate: endDate
  }
}

// ============================================================================
// Constants
// ============================================================================

// Retry configuration
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000
const BACKOFF_MULTIPLIER = 2
const MAX_BACKOFF_MS = 10000

// ============================================================================
// File Download and Decompression
// ============================================================================

/**
 * Custom error types for better error handling
 */
class FileNotFoundError extends Error {
  constructor(url: string) {
    super(`File not found: ${url}`)
    this.name = 'FileNotFoundError'
  }
}

class RetryableError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message)
    this.name = 'RetryableError'
  }
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffMs(attempt: number): number {
  return Math.min(INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt), MAX_BACKOFF_MS)
}

/**
 * Download a gzipped file and decompress it
 */
async function downloadAndDecompress(
  url: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<string> {
  const response = await fetch(url)
  
  if (!response.ok) {
    // 404 means file doesn't exist for this date - not an error, just skip it
    if (response.status === 404) {
      throw new FileNotFoundError(url)
    }
    
    // 5xx errors are server errors - retryable
    if (response.status >= 500 && response.status < 600) {
      throw new RetryableError(`Server error: ${response.status} ${response.statusText}`, response.status)
    }
    
    // 429 is rate limiting - retryable
    if (response.status === 429) {
      throw new RetryableError(`Rate limited: ${response.statusText}`, response.status)
    }
    
    // Other errors are fatal
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }
  
  const contentLength = parseInt(response.headers.get('content-length') || '0', 10)
  const reader = response.body?.getReader()
  
  if (!reader) {
    throw new Error('No response body')
  }
  
  // Read the compressed data
  const chunks: Uint8Array[] = []
  let downloaded = 0
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    chunks.push(value)
    downloaded += value.length
    
    if (onProgress && contentLength > 0) {
      onProgress(downloaded, contentLength)
    }
  }
  
  // Combine chunks
  const compressedData = new Uint8Array(downloaded)
  let offset = 0
  for (const chunk of chunks) {
    compressedData.set(chunk, offset)
    offset += chunk.length
  }
  
  // Decompress using the browser's DecompressionStream
  const decompressedStream = new Response(
    new Blob([compressedData]).stream().pipeThrough(new DecompressionStream('gzip'))
  )
  
  const decompressedText = await decompressedStream.text()
  return decompressedText
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Try to download with retry logic and exponential backoff
 */
async function downloadWithFallback(
  primaryUrl: string,
  onProgress?: (downloaded: number, total: number) => void,
  maxRetries: number = MAX_RETRIES
): Promise<string> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await downloadAndDecompress(primaryUrl, onProgress)
    } catch (error) {
      lastError = error as Error
      
      // If file doesn't exist (404), don't retry - just throw immediately
      if (error instanceof FileNotFoundError) {
        throw error
      }
      
      // If it's a retryable error and we have retries left, wait and retry
      if (error instanceof RetryableError && attempt < maxRetries) {
        const backoffMs = calculateBackoffMs(attempt)
        console.log(`[Importer] Retrying ${primaryUrl} after ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`)
        await sleep(backoffMs)
        continue
      }
      
      // For network errors (TypeError from fetch), retry with backoff
      if (error instanceof TypeError && attempt < maxRetries) {
        const backoffMs = calculateBackoffMs(attempt)
        console.log(`[Importer] Network error, retrying ${primaryUrl} after ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`)
        await sleep(backoffMs)
        continue
      }
      
      // Otherwise, this is a fatal error or we're out of retries
      console.warn(`Failed to download ${primaryUrl} (attempt ${attempt + 1}/${maxRetries + 1}):`, error)
    }
  }
  
  // All retries exhausted
  throw lastError || new Error(`Failed to download ${primaryUrl} after ${maxRetries} retries`)
}

// ============================================================================
// Import Workers
// ============================================================================

/**
 * Import a single file into DuckDB
 */
async function importFile(
  dataType: DataType,
  date: Date,
  db: DuckDBClient,
  onProgress?: (progress: ImportProgress) => void
): Promise<{ rowsImported: number; bytesDownloaded: number; skipped: boolean }> {
  const dateStr = formatDateForUrl(date)
  const url = URL_PATTERNS[dataType](dateStr)
  const dateDisplay = date.toISOString().split('T')[0]
  
  const progress: ImportProgress = {
    type: dataType,
    date: dateDisplay,
    status: 'downloading',
    progress: 0
  }
  
  onProgress?.(progress)
  
  let bytesDownloaded = 0
  
  try {
    // Download and decompress
    const content = await downloadWithFallback(url, (downloaded, total) => {
      bytesDownloaded = downloaded
      progress.progress = Math.round((downloaded / total) * 50)
      onProgress?.({ ...progress })
    })
    
    progress.status = 'importing'
    progress.progress = 50
    onProgress?.({ ...progress })
    
    // Determine table name based on data type
    const tableName = dataType === 'outputs' ? 'bitcoin_outputs' :
                      dataType === 'inputs' ? 'bitcoin_inputs' :
                      'bitcoin_transactions'
    
    // Import into DuckDB
    const rowsImported = await db.importFromTSVContent(content, tableName)
    
    progress.status = 'complete'
    progress.progress = 100
    progress.rowsImported = rowsImported
    onProgress?.({ ...progress })
    
    return { rowsImported, bytesDownloaded, skipped: false }
  } catch (error) {
    // If file doesn't exist (404), this is expected - just skip silently
    if (error instanceof FileNotFoundError) {
      return { rowsImported: 0, bytesDownloaded: 0, skipped: true }
    }
    
    // For all other errors, report them
    progress.status = 'error'
    progress.error = error instanceof Error ? error.message : 'Unknown error'
    onProgress?.({ ...progress })
    throw error
  }
}

// ============================================================================
// Main Import Function
// ============================================================================

/**
 * Import Blockchair data for a date range
 * Downloads files in parallel based on concurrency setting
 */
export async function importBlockchairData(options: ImportOptions): Promise<ImportStats> {
  const {
    dataTypes,
    dateRange,
    concurrency = 5,
    onProgress,
    onStats,
    extractSignatures = true,
    calculateZ = true
  } = options
  
  const db = getDuckDBClient()
  await db.initialize()
  
  // Generate list of files to download
  const dates = generateDateRange(dateRange.startDate, dateRange.endDate)
  const files: { dataType: DataType; date: Date }[] = []
  
  for (const dataType of dataTypes) {
    for (const date of dates) {
      files.push({ dataType, date })
    }
  }
  
  const stats: ImportStats = {
    totalFiles: files.length,
    completedFiles: 0,
    totalRows: 0,
    bytesDownloaded: 0,
    errors: [],
    startTime: Date.now(),
    elapsedMs: 0
  }
  
  // Track skipped files (404s) separately
  let skippedFiles = 0
  
  // Process files with controlled concurrency
  const queue = [...files]
  const inProgress: Promise<void>[] = []
  
  const processNext = async (): Promise<void> => {
    while (queue.length > 0) {
      const file = queue.shift()
      if (!file) break
      
      try {
        const result = await importFile(file.dataType, file.date, db, onProgress)
        stats.completedFiles++
        
        if (result.skipped) {
          // File doesn't exist (404) - not an error, just skip
          skippedFiles++
        } else {
          stats.totalRows += result.rowsImported
          stats.bytesDownloaded += result.bytesDownloaded
        }
      } catch (error) {
        // Only log genuine errors (not 404s)
        const errorMsg = `${file.dataType}/${formatDateForUrl(file.date)}: ${error instanceof Error ? error.message : 'Unknown error'}`
        stats.errors.push(errorMsg)
        stats.completedFiles++
      }
      
      stats.elapsedMs = Date.now() - stats.startTime
      onStats?.({ ...stats })
    }
  }
  
  // Start concurrent workers
  for (let i = 0; i < concurrency; i++) {
    inProgress.push(processNext())
  }
  
  // Wait for all workers to complete
  await Promise.all(inProgress)
  
  // Log summary of skipped files
  if (skippedFiles > 0) {
    console.log(`[Importer] Skipped ${skippedFiles} files (not found on server) - this is normal`)
  }
  
  // Post-processing: Extract signatures from inputs
  if (extractSignatures && dataTypes.includes('inputs')) {
    console.log('[Importer] Extracting signatures from inputs...')
    const extractedCount = await db.extractSignatures()
    console.log(`[Importer] Extracted ${extractedCount} signatures`)
  }
  
  // Calculate Z values if requested
  if (calculateZ) {
    console.log('[Importer] Calculating Z values...')
    const calculatedCount = await db.calculateZ()
    console.log(`[Importer] Calculated Z for ${calculatedCount} signatures`)
  }
  
  // Detect vulnerabilities
  console.log('[Importer] Detecting vulnerabilities...')
  const nonceReuse = await db.detectNonceReuse()
  const biasedCount = await db.detectBiasedNonces()
  console.log(`[Importer] Found ${nonceReuse.length} nonce reuse cases, ${biasedCount} biased nonces`)
  
  stats.elapsedMs = Date.now() - stats.startTime
  
  return stats
}

/**
 * Import a single day's data
 */
export async function importSingleDay(
  date: Date,
  dataTypes: DataType[],
  onProgress?: (progress: ImportProgress) => void
): Promise<{ success: boolean; rowsImported: number; errors: string[] }> {
  const db = getDuckDBClient()
  await db.initialize()
  
  let totalRows = 0
  const errors: string[] = []
  
  for (const dataType of dataTypes) {
    try {
      const result = await importFile(dataType, date, db, onProgress)
      totalRows += result.rowsImported
    } catch (error) {
      errors.push(`${dataType}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  return {
    success: errors.length === 0,
    rowsImported: totalRows,
    errors
  }
}

/**
 * Get the list of files that would be downloaded for a date range
 */
export function getFileList(
  dataTypes: DataType[],
  dateRange: DateRange
): { url: string; dataType: DataType; date: string }[] {
  const dates = generateDateRange(dateRange.startDate, dateRange.endDate)
  const files: { url: string; dataType: DataType; date: string }[] = []
  
  for (const dataType of dataTypes) {
    for (const date of dates) {
      const dateStr = formatDateForUrl(date)
      files.push({
        url: URL_PATTERNS[dataType](dateStr),
        dataType,
        date: date.toISOString().split('T')[0]
      })
    }
  }
  
  return files
}

/**
 * Estimate the total number of files for a date range
 */
export function estimateFileCount(
  dataTypes: DataType[],
  dateRange: DateRange
): number {
  const msPerDay = 1000 * 60 * 60 * 24
  const days = Math.max(1, Math.ceil(
    (dateRange.endDate.getTime() - dateRange.startDate.getTime()) / msPerDay
  ) + 1)
  return days * dataTypes.length
}

/**
 * Check if a specific file exists (by making a HEAD request)
 */
export async function checkFileExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

// ============================================================================
// URL List Parsing
// ============================================================================

/**
 * Parse a URL list file (like dl-urls.txt) to extract download URLs
 * The file format is: "N. http://url" where N is a line number
 * 
 * @param content - The raw content of the URL list file
 * @returns Array of parsed URLs with their data types
 */
export function parseUrlListFile(content: string): { 
  url: string
  dataType: DataType | 'blocks' | 'unknown'
  date?: string 
}[] {
  const lines = content.split('\n').filter(line => line.trim())
  const results: { url: string; dataType: DataType | 'blocks' | 'unknown'; date?: string }[] = []
  
  for (const line of lines) {
    // Remove line number prefix (e.g., "1. http://...")
    const match = line.match(/^\d+\.\s*(.+)$/)
    const url = match ? match[1].trim() : line.trim()
    
    if (!url.startsWith('http')) continue
    
    // Detect data type from URL pattern
    let dataType: DataType | 'blocks' | 'unknown' = 'unknown'
    let date: string | undefined
    
    if (url.includes('/outputs/')) {
      dataType = 'outputs'
      const dateMatch = url.match(/outputs_(\d{8})\.tsv/)
      if (dateMatch) date = dateMatch[1]
    } else if (url.includes('/inputs/')) {
      dataType = 'inputs'
      const dateMatch = url.match(/inputs_(\d{8})\.tsv/)
      if (dateMatch) date = dateMatch[1]
    } else if (url.includes('/transactions/')) {
      dataType = 'transactions'
      const dateMatch = url.match(/transactions_(\d{8})\.tsv/)
      if (dateMatch) date = dateMatch[1]
    } else if (url.includes('block_hash')) {
      dataType = 'blocks'
    }
    
    results.push({ url, dataType, date })
  }
  
  return results
}

/**
 * Import from a URL list file
 * Filters for specified data types and downloads matching files
 */
export async function importFromUrlList(
  urlListContent: string,
  options: {
    dataTypes?: DataType[]
    onProgress?: (progress: ImportProgress) => void
    onStats?: (stats: ImportStats) => void
    concurrency?: number
  } = {}
): Promise<ImportStats> {
  const {
    dataTypes = ['inputs'],
    onProgress,
    onStats,
    concurrency = 5
  } = options
  
  const parsedUrls = parseUrlListFile(urlListContent)
  const filteredUrls = parsedUrls.filter(u => 
    dataTypes.includes(u.dataType as DataType)
  )
  
  const db = getDuckDBClient()
  await db.initialize()
  
  const stats: ImportStats = {
    totalFiles: filteredUrls.length,
    completedFiles: 0,
    totalRows: 0,
    bytesDownloaded: 0,
    errors: [],
    startTime: Date.now(),
    elapsedMs: 0
  }
  
  // Track skipped files (404s) separately
  let skippedFiles = 0
  
  // Process with controlled concurrency
  const queue = [...filteredUrls]
  
  const processNext = async (): Promise<void> => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      
      const progress: ImportProgress = {
        type: item.dataType as DataType,
        date: item.date || 'unknown',
        status: 'downloading',
        progress: 0
      }
      
      onProgress?.(progress)
      
      try {
        const content = await downloadWithFallback(item.url, (downloaded, total) => {
          stats.bytesDownloaded = downloaded
          progress.progress = Math.round((downloaded / total) * 50)
          onProgress?.({ ...progress })
        })
        
        progress.status = 'importing'
        progress.progress = 50
        onProgress?.({ ...progress })
        
        const tableName = item.dataType === 'outputs' ? 'bitcoin_outputs' :
                         item.dataType === 'inputs' ? 'bitcoin_inputs' :
                         'bitcoin_transactions'
        
        const rowsImported = await db.importFromTSVContent(content, tableName)
        
        stats.completedFiles++
        stats.totalRows += rowsImported
        
        progress.status = 'complete'
        progress.progress = 100
        progress.rowsImported = rowsImported
        onProgress?.({ ...progress })
      } catch (error) {
        // If file doesn't exist (404), this is expected - just skip silently
        if (error instanceof FileNotFoundError) {
          stats.completedFiles++
          skippedFiles++
          // Don't report as error
        } else {
          // Only log genuine errors (not 404s)
          const errorMsg = `${item.url}: ${error instanceof Error ? error.message : 'Unknown error'}`
          stats.errors.push(errorMsg)
          stats.completedFiles++
          
          progress.status = 'error'
          progress.error = errorMsg
          onProgress?.({ ...progress })
        }
      }
      
      stats.elapsedMs = Date.now() - stats.startTime
      onStats?.({ ...stats })
    }
  }
  
  // Start concurrent workers
  const workers: Promise<void>[] = []
  for (let i = 0; i < concurrency; i++) {
    workers.push(processNext())
  }
  
  await Promise.all(workers)
  
  // Log summary of skipped files
  if (skippedFiles > 0) {
    console.log(`[Importer] Skipped ${skippedFiles} files (not found on server) - this is normal`)
  }
  
  stats.elapsedMs = Date.now() - stats.startTime
  return stats
}

// ============================================================================
// Export Functions
// ============================================================================

export {
  formatDateForUrl,
  generateDateRange,
  downloadAndDecompress,
  BITCOIN_START_DATE,
  BASE_URL,
  BLOCKS_URL
}
