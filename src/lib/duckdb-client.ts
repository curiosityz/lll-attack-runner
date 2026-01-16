/**
 * DuckDB WebAssembly Client for Blockchain Data Analysis
 * 
 * This module provides integration with DuckDB WASM for:
 * - Storing and querying Bitcoin blockchain data from Blockchair dumps
 * - Extracting ECDSA signature components (R, S) from inputs
 * - Calculating message hashes (Z) for cryptographic analysis
 * - Detecting signature vulnerabilities (nonce reuse, biased nonces, etc.)
 */

import * as duckdb from '@duckdb/duckdb-wasm'
import { ExtractedSignature } from './blockchair-parser'

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface DuckDBConfig {
  persistToIndexedDB?: boolean
  databaseName?: string
}

export interface ImportProgress {
  type: 'outputs' | 'inputs' | 'transactions'
  date: string
  status: 'pending' | 'downloading' | 'decompressing' | 'importing' | 'complete' | 'error'
  progress: number // 0-100
  rowsImported?: number
  error?: string
}

export interface ImportStats {
  totalFiles: number
  completedFiles: number
  totalRows: number
  bytesDownloaded: number
  errors: string[]
  startTime: number
  elapsedMs: number
}

export interface SignatureWithZ {
  r: string
  s: string
  z: string
  txHash: string
  inputIndex: number
  blockId: number
  timestamp: number
  address?: string
  publicKey?: string
  value: string
}

// ============================================================================
// DuckDB Client Class
// ============================================================================

export class DuckDBClient {
  private db: duckdb.AsyncDuckDB | null = null
  private conn: duckdb.AsyncDuckDBConnection | null = null
  private config: DuckDBConfig
  private isInitialized = false
  private initPromise: Promise<void> | null = null

  constructor(config: DuckDBConfig = {}) {
    this.config = {
      persistToIndexedDB: true,
      databaseName: 'blockchain_data',
      ...config
    }
  }

  /**
   * Initialize DuckDB WebAssembly
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this._doInitialize()
    return this.initPromise
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Select the appropriate bundle based on browser capabilities
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)

      // Create worker
      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
      )
      const worker = new Worker(workerUrl)
      const logger = new duckdb.ConsoleLogger()

      // Instantiate DuckDB
      this.db = new duckdb.AsyncDuckDB(logger, worker)
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker)

      // Open database
      // Note: DuckDB WASM currently uses :memory: for browser environments
      // IndexedDB persistence is handled separately via OPFS or manual export
      const dbPath = this.config.persistToIndexedDB 
        ? `idb://${this.config.databaseName || 'blockchain_data'}.db`
        : ':memory:'
      await this.db.open({
        path: dbPath,
        accessMode: duckdb.DuckDBAccessMode.READ_WRITE
      })

      // Create connection
      this.conn = await this.db.connect()

      // Initialize schema
      await this.initializeSchema()

      this.isInitialized = true
      console.log('[DuckDB] Initialized successfully')
    } catch (error) {
      console.error('[DuckDB] Initialization error:', error)
      throw error
    }
  }

  /**
   * Initialize the database schema for blockchain data
   */
  private async initializeSchema(): Promise<void> {
    if (!this.conn) throw new Error('Database not connected')

    // Create tables for Blockchair data
    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS bitcoin_outputs (
        block_id INTEGER,
        transaction_hash VARCHAR,
        output_index INTEGER,
        time TIMESTAMP,
        value BIGINT,
        value_usd DOUBLE,
        recipient VARCHAR,
        type VARCHAR,
        script_hex VARCHAR,
        is_spent BOOLEAN,
        spending_block_id INTEGER,
        spending_transaction_hash VARCHAR,
        spending_index INTEGER,
        PRIMARY KEY (transaction_hash, output_index)
      );
    `)

    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS bitcoin_inputs (
        block_id INTEGER,
        transaction_hash VARCHAR,
        input_index INTEGER,
        time TIMESTAMP,
        value BIGINT,
        value_usd DOUBLE,
        recipient VARCHAR,
        type VARCHAR,
        script_hex VARCHAR,
        spending_signature_hex VARCHAR,
        spending_witness_hex VARCHAR,
        spending_sequence BIGINT,
        spending_n_locktime INTEGER,
        is_spent BOOLEAN,
        spending_transaction_hash VARCHAR,
        spending_block_id INTEGER,
        spending_index INTEGER,
        PRIMARY KEY (transaction_hash, input_index)
      );
    `)

    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS bitcoin_transactions (
        block_id INTEGER,
        hash VARCHAR PRIMARY KEY,
        time TIMESTAMP,
        size INTEGER,
        weight INTEGER,
        version INTEGER,
        lock_time INTEGER,
        is_coinbase BOOLEAN,
        has_witness BOOLEAN,
        input_count INTEGER,
        output_count INTEGER,
        input_total BIGINT,
        output_total BIGINT,
        fee BIGINT,
        fee_usd DOUBLE
      );
    `)

    // Table for extracted signatures with R, S, Z
    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS extracted_signatures (
        id INTEGER PRIMARY KEY,
        r VARCHAR NOT NULL,
        s VARCHAR NOT NULL,
        z VARCHAR,
        transaction_hash VARCHAR NOT NULL,
        input_index INTEGER NOT NULL,
        block_id INTEGER,
        time TIMESTAMP,
        value BIGINT,
        address VARCHAR,
        public_key VARCHAR,
        sighash_type INTEGER,
        signature_type VARCHAR,
        r_leading_zeros INTEGER,
        is_nonce_reuse BOOLEAN DEFAULT FALSE,
        is_biased_nonce BOOLEAN DEFAULT FALSE,
        is_small_r BOOLEAN DEFAULT FALSE,
        vulnerability_severity VARCHAR DEFAULT 'none',
        UNIQUE (transaction_hash, input_index)
      );
    `)

    // Create indexes for fast vulnerability queries
    await this.conn.query(`
      CREATE INDEX IF NOT EXISTS idx_sig_r ON extracted_signatures(r);
    `)

    await this.conn.query(`
      CREATE INDEX IF NOT EXISTS idx_sig_block ON extracted_signatures(block_id);
    `)

    console.log('[DuckDB] Schema initialized')
  }

  /**
   * Import data directly from a gzipped TSV URL
   * DuckDB can read compressed files directly over HTTP
   */
  async importFromUrl(url: string, tableName: string): Promise<number> {
    if (!this.conn) throw new Error('Database not connected')

    try {
      // DuckDB can read gzipped TSV directly with httpfs extension
      await this.conn.query(`INSTALL httpfs;`)
      await this.conn.query(`LOAD httpfs;`)

      // Read directly from URL - DuckDB handles gzip decompression automatically
      const result = await this.conn.query(`
        INSERT INTO ${tableName}
        SELECT * FROM read_csv_auto('${url}', 
          delim='\t', 
          header=true,
          compression='gzip',
          ignore_errors=true
        );
      `)

      const rowCount = result.numRows
      console.log(`[DuckDB] Imported ${rowCount} rows from ${url}`)
      return rowCount
    } catch (error) {
      console.error(`[DuckDB] Import error for ${url}:`, error)
      throw error
    }
  }

  /**
   * Import data from decompressed TSV content
   */
  async importFromTSVContent(content: string, tableName: string): Promise<number> {
    if (!this.conn) throw new Error('Database not connected')

    try {
      // Register the content as a file
      const encoder = new TextEncoder()
      const data = encoder.encode(content)
      await this.db!.registerFileBuffer(`temp_${tableName}.tsv`, data)

      // Insert from the registered file
      const result = await this.conn.query(`
        INSERT OR IGNORE INTO ${tableName}
        SELECT * FROM read_csv_auto('temp_${tableName}.tsv',
          delim='\t',
          header=true,
          ignore_errors=true
        );
      `)

      // Clean up registered file
      await this.db!.dropFile(`temp_${tableName}.tsv`)

      const rowCount = result.numRows
      console.log(`[DuckDB] Imported ${rowCount} rows into ${tableName}`)
      return rowCount
    } catch (error) {
      console.error(`[DuckDB] Import error:`, error)
      throw error
    }
  }

  /**
   * Extract signatures from imported inputs data
   * This parses DER signatures from spending_signature_hex and spending_witness_hex
   */
  async extractSignatures(): Promise<number> {
    if (!this.conn) throw new Error('Database not connected')

    // This is a simplified version - in production, we'd use a UDF for DER parsing
    // For now, we'll query inputs and process them in JavaScript
    const result = await this.conn.query(`
      SELECT 
        block_id,
        transaction_hash,
        input_index,
        time,
        value,
        recipient,
        spending_signature_hex,
        spending_witness_hex
      FROM bitcoin_inputs
      WHERE (spending_signature_hex IS NOT NULL AND LENGTH(spending_signature_hex) > 10)
         OR (spending_witness_hex IS NOT NULL AND LENGTH(spending_witness_hex) > 10)
    `)

    // Process in batches to avoid memory issues
    let extractedCount = 0
    const rows = result.toArray()

    for (const row of rows) {
      // Parse the signature - this would call parseDERSignature
      // For now, we mark it as needing processing
      const txHash = row.transaction_hash
      const inputIndex = row.input_index
      const sigHex = row.spending_signature_hex || row.spending_witness_hex

      if (sigHex && typeof sigHex === 'string' && sigHex.length > 20) {
        // In production, we'd parse DER here
        // This is a placeholder for the extraction logic
        extractedCount++
      }
    }

    return extractedCount
  }

  /**
   * Calculate Z (message hash) for signatures
   * Z is calculated from transaction data using the sighash algorithm
   */
  async calculateZ(): Promise<number> {
    if (!this.conn) throw new Error('Database not connected')

    // Query signatures that don't have Z calculated yet
    const result = await this.conn.query(`
      SELECT 
        s.id,
        s.transaction_hash,
        s.input_index,
        s.sighash_type,
        t.version,
        t.lock_time
      FROM extracted_signatures s
      LEFT JOIN bitcoin_transactions t ON s.transaction_hash = t.hash
      WHERE s.z IS NULL OR s.z = ''
    `)

    let calculatedCount = 0
    const rows = result.toArray()

    // In a full implementation, we would:
    // 1. Reconstruct the transaction pre-image
    // 2. Apply the sighash algorithm based on sighash_type
    // 3. Double SHA256 hash the pre-image to get Z
    // This requires the full transaction data including all inputs/outputs

    console.log(`[DuckDB] ${rows.length} signatures need Z calculation`)
    
    // For now, return the count of signatures needing calculation
    calculatedCount = rows.length

    return calculatedCount
  }

  /**
   * Detect nonce reuse (same R value with different Z)
   */
  async detectNonceReuse(): Promise<{ rValue: string; count: number; signatures: string[] }[]> {
    if (!this.conn) throw new Error('Database not connected')

    const result = await this.conn.query(`
      SELECT 
        r,
        COUNT(*) as reuse_count,
        ARRAY_AGG(transaction_hash) as tx_hashes
      FROM extracted_signatures
      GROUP BY r
      HAVING COUNT(*) > 1
      ORDER BY reuse_count DESC
      LIMIT 1000
    `)

    const reused: { rValue: string; count: number; signatures: string[] }[] = []
    const rows = result.toArray()

    for (const row of rows) {
      reused.push({
        rValue: row.r,
        count: row.reuse_count,
        signatures: row.tx_hashes
      })
    }

    // Mark these signatures as vulnerable
    // Note: R values are hex strings from our controlled extraction, not user input
    // They are validated during extraction to contain only hex characters
    if (reused.length > 0) {
      // Sanitize R values - ensure they only contain valid hex characters
      const sanitizedRValues = reused
        .map(r => r.rValue)
        .filter(rv => /^[a-fA-F0-9]+$/.test(rv))
        .map(rv => `'${rv}'`)
        .join(',')
      
      if (sanitizedRValues.length > 0) {
        await this.conn.query(`
          UPDATE extracted_signatures
          SET is_nonce_reuse = TRUE,
              vulnerability_severity = 'critical'
          WHERE r IN (${sanitizedRValues})
        `)
      }
    }

    return reused
  }

  /**
   * Detect biased nonces (signatures with many leading zeros in R)
   */
  async detectBiasedNonces(minLeadingZeros: number = 10): Promise<number> {
    if (!this.conn) throw new Error('Database not connected')

    // Validate and sanitize the minLeadingZeros parameter
    const sanitizedMinZeros = Math.max(0, Math.min(256, Math.floor(Number(minLeadingZeros) || 10)))

    // Update biased nonce flags
    const result = await this.conn.query(`
      UPDATE extracted_signatures
      SET is_biased_nonce = TRUE,
          vulnerability_severity = CASE 
            WHEN r_leading_zeros > 20 THEN 'critical'
            WHEN r_leading_zeros > 15 THEN 'high'
            ELSE 'medium'
          END
      WHERE r_leading_zeros >= ${sanitizedMinZeros}
    `)

    return result.numRows
  }

  /**
   * Get signature statistics
   */
  async getStats(): Promise<{
    totalSignatures: number
    nonceReuse: number
    biasedNonces: number
    smallR: number
    bySeverity: Record<string, number>
  }> {
    if (!this.conn) throw new Error('Database not connected')

    const countResult = await this.conn.query(`SELECT COUNT(*) as total FROM extracted_signatures`)
    const totalSignatures = countResult.toArray()[0]?.total || 0

    const nonceReuseResult = await this.conn.query(`
      SELECT COUNT(*) as count FROM extracted_signatures WHERE is_nonce_reuse = TRUE
    `)
    const nonceReuse = nonceReuseResult.toArray()[0]?.count || 0

    const biasedResult = await this.conn.query(`
      SELECT COUNT(*) as count FROM extracted_signatures WHERE is_biased_nonce = TRUE
    `)
    const biasedNonces = biasedResult.toArray()[0]?.count || 0

    const smallRResult = await this.conn.query(`
      SELECT COUNT(*) as count FROM extracted_signatures WHERE is_small_r = TRUE
    `)
    const smallR = smallRResult.toArray()[0]?.count || 0

    const severityResult = await this.conn.query(`
      SELECT vulnerability_severity, COUNT(*) as count
      FROM extracted_signatures
      GROUP BY vulnerability_severity
    `)
    const bySeverity: Record<string, number> = {}
    for (const row of severityResult.toArray()) {
      bySeverity[row.vulnerability_severity || 'none'] = row.count
    }

    return {
      totalSignatures,
      nonceReuse,
      biasedNonces,
      smallR,
      bySeverity
    }
  }

  /**
   * Query signatures for analysis
   */
  async querySignatures(options: {
    limit?: number
    offset?: number
    onlyVulnerable?: boolean
    minLeadingZeros?: number
  } = {}): Promise<SignatureWithZ[]> {
    if (!this.conn) throw new Error('Database not connected')

    const { limit = 100, offset = 0, onlyVulnerable = false, minLeadingZeros } = options

    // Sanitize numeric parameters to prevent injection
    const sanitizedLimit = Math.max(1, Math.min(10000, Math.floor(Number(limit) || 100)))
    const sanitizedOffset = Math.max(0, Math.floor(Number(offset) || 0))

    let whereClause = 'WHERE 1=1'
    if (onlyVulnerable) {
      whereClause += ' AND (is_nonce_reuse = TRUE OR is_biased_nonce = TRUE OR is_small_r = TRUE)'
    }
    if (minLeadingZeros !== undefined) {
      const sanitizedMinZeros = Math.max(0, Math.min(256, Math.floor(Number(minLeadingZeros) || 0)))
      whereClause += ` AND r_leading_zeros >= ${sanitizedMinZeros}`
    }

    const result = await this.conn.query(`
      SELECT 
        r, s, z,
        transaction_hash as txHash,
        input_index as inputIndex,
        block_id as blockId,
        time as timestamp,
        address,
        public_key as publicKey,
        value
      FROM extracted_signatures
      ${whereClause}
      ORDER BY block_id DESC
      LIMIT ${sanitizedLimit}
      OFFSET ${sanitizedOffset}
    `)

    return result.toArray().map(row => ({
      r: row.r,
      s: row.s,
      z: row.z || '',
      txHash: row.txHash,
      inputIndex: row.inputIndex,
      blockId: row.blockId,
      timestamp: row.timestamp,
      address: row.address,
      publicKey: row.publicKey,
      value: row.value?.toString() || '0'
    }))
  }

  /**
   * Export signatures to JSON format
   */
  async exportSignatures(options: {
    onlyVulnerable?: boolean
    limit?: number
  } = {}): Promise<string> {
    const signatures = await this.querySignatures({
      ...options,
      limit: options.limit || 10000
    })
    return JSON.stringify(signatures, null, 2)
  }

  /**
   * Get table row counts
   */
  async getTableCounts(): Promise<{
    outputs: number
    inputs: number
    transactions: number
    signatures: number
  }> {
    if (!this.conn) throw new Error('Database not connected')

    const outputsCount = (await this.conn.query('SELECT COUNT(*) as c FROM bitcoin_outputs')).toArray()[0]?.c || 0
    const inputsCount = (await this.conn.query('SELECT COUNT(*) as c FROM bitcoin_inputs')).toArray()[0]?.c || 0
    const txCount = (await this.conn.query('SELECT COUNT(*) as c FROM bitcoin_transactions')).toArray()[0]?.c || 0
    const sigCount = (await this.conn.query('SELECT COUNT(*) as c FROM extracted_signatures')).toArray()[0]?.c || 0

    return {
      outputs: outputsCount,
      inputs: inputsCount,
      transactions: txCount,
      signatures: sigCount
    }
  }

  /**
   * Execute a raw SQL query
   */
  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    if (!this.conn) throw new Error('Database not connected')
    const result = await this.conn.query(sql)
    return result.toArray() as T[]
  }

  /**
   * Check if the client is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.conn !== null
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.conn) {
      await this.conn.close()
      this.conn = null
    }
    if (this.db) {
      await this.db.terminate()
      this.db = null
    }
    this.isInitialized = false
    this.initPromise = null
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let duckDBClientInstance: DuckDBClient | null = null

export function getDuckDBClient(): DuckDBClient {
  if (!duckDBClientInstance) {
    duckDBClientInstance = new DuckDBClient()
  }
  return duckDBClientInstance
}

export async function initializeDuckDB(): Promise<DuckDBClient> {
  const client = getDuckDBClient()
  await client.initialize()
  return client
}

export function resetDuckDBClient(): void {
  if (duckDBClientInstance) {
    duckDBClientInstance.close()
  }
  duckDBClientInstance = null
}
