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
 * Get the default date range (2009-01-03 to today)
 */
export function getDefaultDateRange(): DateRange {
  return {
    startDate: BITCOIN_START_DATE,
    endDate: new Date('2026-01-15') // As specified in the issue
  }
}

// ============================================================================
// File Download and Decompression
// ============================================================================

/**
 * Download a gzipped file and decompress it
 */
async function downloadAndDecompress(
  url: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<string> {
  const response = await fetch(url)
  
  if (!response.ok) {
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
 * Try to download with fallback URLs
 */
async function downloadWithFallback(
  primaryUrl: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<string> {
  try {
    return await downloadAndDecompress(primaryUrl, onProgress)
  } catch (error) {
    // If primary fails, the file might not exist for this date
    console.warn(`Failed to download ${primaryUrl}:`, error)
    throw error
  }
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
): Promise<{ rowsImported: number; bytesDownloaded: number }> {
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
    
    return { rowsImported, bytesDownloaded }
  } catch (error) {
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
        stats.totalRows += result.rowsImported
        stats.bytesDownloaded += result.bytesDownloaded
      } catch (error) {
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
  const days = Math.ceil(
    (dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1
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
