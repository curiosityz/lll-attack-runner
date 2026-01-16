/**
 * Database Client for Streaming Signature Data
 * 
 * This module provides integration with QuestDB (time-series database)
 * for persisting ECDSA signature data extracted from blockchain dumps.
 * 
 * QuestDB was chosen for:
 * - High-performance columnar storage for 256-bit integers
 * - Simple HTTP API suitable for browser-based clients
 * - Time-series optimized queries for temporal analysis
 * - ILP (InfluxDB Line Protocol) for efficient streaming writes
 * 
 * Alternative databases supported:
 * - ClickHouse (via HTTP interface)
 * - InfluxDB (via HTTP API)
 * - Cloudflare D1 (serverless SQLite)
 */

import { ExtractedSignature } from './blockchair-parser'
import { ParsedSignature } from './dataParser'

// ============================================================================
// Constants
// ============================================================================

// Cloudflare D1 batch size limit (may vary by plan)
const D1_BATCH_SIZE = 100

// ============================================================================
// Types and Interfaces
// ============================================================================

export type DatabaseType = 'questdb' | 'clickhouse' | 'influxdb' | 'cloudflare-d1'

export interface DatabaseConfig {
  type: DatabaseType
  host: string
  port: number
  database?: string
  username?: string
  password?: string
  // For InfluxDB
  org?: string
  bucket?: string
  token?: string
  // For Cloudflare D1
  accountId?: string
  databaseId?: string
  apiToken?: string
  // Connection options
  useTLS: boolean
  timeout: number
}

export interface StreamingStats {
  totalStreamed: number
  successCount: number
  errorCount: number
  lastStreamedAt: number | null
  bytesWritten: number
  errors: string[]
}

export interface SignatureRecord {
  // Primary identifiers
  r_value: string
  s_value: string
  z_hash: string
  // Context
  pubkey: string | null
  address: string | null
  // Location
  tx_hash: string
  input_index: number
  block_id: number
  timestamp: number
  // Value
  value_satoshis: string
  // Metadata
  sighash_type: number
  signature_type: 'legacy' | 'segwit'
  // Vulnerability flags
  is_nonce_reuse: boolean
  is_biased_nonce: boolean
  is_small_r: boolean
  is_related_nonce: boolean
  r_leading_zeros: number
  vulnerability_severity: 'critical' | 'high' | 'medium' | 'low' | 'none'
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_DATABASE_CONFIG: DatabaseConfig = {
  type: 'questdb',
  host: 'localhost',
  port: 9000,
  database: 'crypto_signatures',
  useTLS: false,
  timeout: 30000,
  // Cloudflare D1 defaults (will need to be configured by user)
  accountId: '',
  databaseId: '',
  apiToken: ''
}

// ============================================================================
// Database Client Class
// ============================================================================

export class DatabaseClient {
  private config: DatabaseConfig
  private stats: StreamingStats
  private isConnected: boolean = false
  private connectionTestPending: boolean = false

  constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = { ...DEFAULT_DATABASE_CONFIG, ...config }
    this.stats = {
      totalStreamed: 0,
      successCount: 0,
      errorCount: 0,
      lastStreamedAt: null,
      bytesWritten: 0,
      errors: []
    }
  }

  /**
   * Get the base URL for the database
   */
  private getBaseUrl(): string {
    if (this.config.type === 'cloudflare-d1') {
      // Cloudflare D1 uses API endpoint
      return `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/d1/database/${this.config.databaseId}`
    }
    const protocol = this.config.useTLS ? 'https' : 'http'
    return `${protocol}://${this.config.host}:${this.config.port}`
  }

  /**
   * Test connection to the database
   */
  async testConnection(): Promise<{ success: boolean; message: string; latency?: number }> {
    if (this.connectionTestPending) {
      return { success: false, message: 'Connection test already in progress' }
    }

    this.connectionTestPending = true
    const startTime = Date.now()

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

      let response: Response

      switch (this.config.type) {
        case 'questdb':
          // QuestDB health check endpoint
          response = await fetch(`${this.getBaseUrl()}/exec?query=SELECT%201`, {
            signal: controller.signal,
            headers: this.getAuthHeaders()
          })
          break

        case 'clickhouse':
          // ClickHouse ping endpoint
          response = await fetch(`${this.getBaseUrl()}/ping`, {
            signal: controller.signal,
            headers: this.getAuthHeaders()
          })
          break

        case 'influxdb':
          // InfluxDB health endpoint
          response = await fetch(`${this.getBaseUrl()}/health`, {
            signal: controller.signal,
            headers: this.getAuthHeaders()
          })
          break

        case 'cloudflare-d1':
          // Cloudflare D1 test query
          if (!this.config.accountId || !this.config.databaseId || !this.config.apiToken) {
            return { 
              success: false, 
              message: 'Cloudflare D1 requires accountId, databaseId, and apiToken' 
            }
          }
          response = await fetch(`${this.getBaseUrl()}/query`, {
            method: 'POST',
            signal: controller.signal,
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ sql: 'SELECT 1' })
          })
          break

        default:
          throw new Error(`Unsupported database type: ${this.config.type}`)
      }

      clearTimeout(timeoutId)
      const latency = Date.now() - startTime

      if (response.ok) {
        this.isConnected = true
        return { 
          success: true, 
          message: `Connected to ${this.config.type} ${this.config.type === 'cloudflare-d1' ? 'database' : `at ${this.config.host}:${this.config.port}`}`,
          latency 
        }
      } else {
        const errorText = await response.text()
        return { 
          success: false, 
          message: `Connection failed: ${response.status} - ${errorText}` 
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (message.includes('abort')) {
        return { success: false, message: 'Connection timeout' }
      }
      return { success: false, message: `Connection error: ${message}` }
    } finally {
      this.connectionTestPending = false
    }
  }

  /**
   * Get authentication headers based on database type
   */
  private getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    }

    if (this.config.username && this.config.password) {
      const auth = btoa(`${this.config.username}:${this.config.password}`)
      headers['Authorization'] = `Basic ${auth}`
    }

    if (this.config.type === 'influxdb' && this.config.token) {
      headers['Authorization'] = `Token ${this.config.token}`
    }

    if (this.config.type === 'cloudflare-d1' && this.config.apiToken) {
      headers['Authorization'] = `Bearer ${this.config.apiToken}`
    }

    return headers
  }

  /**
   * Initialize the database schema (create table if not exists)
   */
  async initializeSchema(): Promise<{ success: boolean; message: string }> {
    const createTableQuery = this.getCreateTableQuery()
    
    try {
      const response = await this.executeQuery(createTableQuery)
      if (response.success) {
        return { success: true, message: 'Database schema initialized successfully' }
      }
      return { success: false, message: response.message || 'Failed to initialize schema' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, message: `Schema initialization failed: ${message}` }
    }
  }

  /**
   * Get the CREATE TABLE query for the current database type
   */
  private getCreateTableQuery(): string {
    switch (this.config.type) {
      case 'questdb':
        return `
          CREATE TABLE IF NOT EXISTS crypto_signatures (
            r_value STRING,
            s_value STRING,
            z_hash STRING,
            pubkey STRING,
            address STRING,
            tx_hash STRING,
            input_index INT,
            block_id INT,
            timestamp TIMESTAMP,
            value_satoshis LONG,
            sighash_type SHORT,
            signature_type SYMBOL,
            is_nonce_reuse BOOLEAN,
            is_biased_nonce BOOLEAN,
            is_small_r BOOLEAN,
            is_related_nonce BOOLEAN,
            r_leading_zeros SHORT,
            vulnerability_severity SYMBOL
          ) timestamp(timestamp) PARTITION BY DAY;
        `

      case 'clickhouse':
        return `
          CREATE TABLE IF NOT EXISTS ${this.config.database || 'default'}.crypto_signatures (
            r_value FixedString(64),
            s_value FixedString(64),
            z_hash FixedString(64),
            pubkey Nullable(String),
            address Nullable(String),
            tx_hash FixedString(64),
            input_index UInt32,
            block_id UInt32,
            timestamp DateTime,
            value_satoshis UInt64,
            sighash_type UInt8,
            signature_type Enum8('legacy' = 1, 'segwit' = 2),
            is_nonce_reuse Bool,
            is_biased_nonce Bool,
            is_small_r Bool,
            is_related_nonce Bool,
            r_leading_zeros UInt8,
            vulnerability_severity Enum8('none' = 0, 'low' = 1, 'medium' = 2, 'high' = 3, 'critical' = 4)
          ) ENGINE = MergeTree()
          ORDER BY (r_value, timestamp)
          PARTITION BY toYYYYMMDD(timestamp);
        `

      case 'cloudflare-d1':
        return `
          CREATE TABLE IF NOT EXISTS crypto_signatures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            r_value TEXT NOT NULL,
            s_value TEXT NOT NULL,
            z_hash TEXT NOT NULL,
            pubkey TEXT,
            address TEXT,
            tx_hash TEXT NOT NULL,
            input_index INTEGER NOT NULL,
            block_id INTEGER NOT NULL,
            timestamp INTEGER NOT NULL,
            value_satoshis TEXT NOT NULL,
            sighash_type INTEGER NOT NULL,
            signature_type TEXT NOT NULL,
            is_nonce_reuse INTEGER NOT NULL DEFAULT 0,
            is_biased_nonce INTEGER NOT NULL DEFAULT 0,
            is_small_r INTEGER NOT NULL DEFAULT 0,
            is_related_nonce INTEGER NOT NULL DEFAULT 0,
            r_leading_zeros INTEGER NOT NULL DEFAULT 0,
            vulnerability_severity TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_r_value ON crypto_signatures(r_value);
          CREATE INDEX IF NOT EXISTS idx_block_id ON crypto_signatures(block_id);
          CREATE INDEX IF NOT EXISTS idx_timestamp ON crypto_signatures(timestamp);
          CREATE INDEX IF NOT EXISTS idx_vulnerability ON crypto_signatures(vulnerability_severity);
        `

      case 'influxdb':
        // InfluxDB uses schemaless approach - no explicit schema creation needed
        return ''

      default:
        throw new Error(`Unsupported database type: ${this.config.type}`)
    }
  }

  /**
   * Execute a query on the database
   */
  async executeQuery(query: string): Promise<{ success: boolean; data?: unknown; message?: string }> {
    try {
      let url: string
      let body: string | null = null
      const headers = this.getAuthHeaders()

      switch (this.config.type) {
        case 'questdb':
          url = `${this.getBaseUrl()}/exec?query=${encodeURIComponent(query)}`
          break

        case 'clickhouse':
          url = `${this.getBaseUrl()}/`
          body = query
          break

        case 'influxdb':
          url = `${this.getBaseUrl()}/api/v2/query?org=${this.config.org || 'default'}`
          body = JSON.stringify({ query, type: 'flux' })
          break

        case 'cloudflare-d1':
          url = `${this.getBaseUrl()}/query`
          body = JSON.stringify({ sql: query })
          break

        default:
          throw new Error(`Unsupported database type: ${this.config.type}`)
      }

      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers,
        body
      })

      if (response.ok) {
        const data = await response.json().catch(() => null)
        return { success: true, data }
      } else {
        const errorText = await response.text()
        return { success: false, message: `Query failed: ${errorText}` }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, message: `Query error: ${message}` }
    }
  }

  /**
   * Convert ExtractedSignature to SignatureRecord for database storage
   */
  private convertToRecord(signature: ExtractedSignature): SignatureRecord {
    const hasNonceReuse = signature.vulnerabilities.some(v => v.type === 'nonce_reuse')
    const hasBiasedNonce = signature.vulnerabilities.some(v => v.type === 'biased_nonce' || v.type === 'msb_bias' || v.type === 'lsb_bias')
    const hasSmallR = signature.vulnerabilities.some(v => v.type === 'small_r')
    const hasRelatedNonce = signature.vulnerabilities.some(v => v.type === 'related_nonce')

    // Calculate leading zeros in R value
    const rBits = signature.r.toString(2)
    const leadingZeros = 256 - rBits.length

    // Determine highest severity
    let severity: 'critical' | 'high' | 'medium' | 'low' | 'none' = 'none'
    for (const vuln of signature.vulnerabilities) {
      if (vuln.severity === 'critical') {
        severity = 'critical'
        break
      }
      if (vuln.severity === 'high' && severity !== 'critical') {
        severity = 'high'
      }
      if (vuln.severity === 'medium' && severity !== 'critical' && severity !== 'high') {
        severity = 'medium'
      }
      if (vuln.severity === 'low' && severity === 'none') {
        severity = 'low'
      }
    }

    return {
      r_value: signature.r.toString(16).padStart(64, '0'),
      s_value: signature.s.toString(16).padStart(64, '0'),
      z_hash: signature.z.toString(16).padStart(64, '0'),
      pubkey: signature.publicKey || null,
      address: signature.address || null,
      tx_hash: signature.transactionHash,
      input_index: signature.inputIndex,
      block_id: signature.blockId,
      timestamp: signature.timestamp,
      value_satoshis: signature.value.toString(),
      sighash_type: signature.sighashType,
      signature_type: signature.signatureType,
      is_nonce_reuse: hasNonceReuse,
      is_biased_nonce: hasBiasedNonce,
      is_small_r: hasSmallR,
      is_related_nonce: hasRelatedNonce,
      r_leading_zeros: leadingZeros,
      vulnerability_severity: severity
    }
  }

  /**
   * Convert ParsedSignature to SignatureRecord
   */
  private convertParsedToRecord(signature: ParsedSignature): SignatureRecord {
    const rBits = signature.r.toString(2)
    const leadingZeros = 256 - rBits.length

    return {
      r_value: signature.r.toString(16).padStart(64, '0'),
      s_value: signature.s.toString(16).padStart(64, '0'),
      z_hash: signature.sighash || '0'.repeat(64),
      pubkey: null,
      address: signature.address || null,
      tx_hash: signature.hash || '',
      input_index: 0,
      block_id: signature.blockNumber || 0,
      timestamp: signature.timestamp || Date.now(),
      value_satoshis: '0',
      sighash_type: signature.v || 1,
      signature_type: 'legacy',
      is_nonce_reuse: false,
      is_biased_nonce: leadingZeros > 10,
      is_small_r: false,
      is_related_nonce: false,
      r_leading_zeros: leadingZeros,
      vulnerability_severity: leadingZeros > 10 ? 'high' : 'none'
    }
  }

  /**
   * Stream a batch of ExtractedSignatures to the database
   */
  async streamSignatures(signatures: ExtractedSignature[]): Promise<{ 
    success: boolean
    count: number
    errors: string[]
  }> {
    const records = signatures.map(sig => this.convertToRecord(sig))
    return this.streamRecords(records)
  }

  /**
   * Stream a batch of ParsedSignatures to the database
   */
  async streamParsedSignatures(signatures: ParsedSignature[]): Promise<{
    success: boolean
    count: number
    errors: string[]
  }> {
    const records = signatures.map(sig => this.convertParsedToRecord(sig))
    return this.streamRecords(records)
  }

  /**
   * Stream records to the database
   */
  private async streamRecords(records: SignatureRecord[]): Promise<{
    success: boolean
    count: number
    errors: string[]
  }> {
    if (records.length === 0) {
      return { success: true, count: 0, errors: [] }
    }

    const errors: string[] = []
    let successCount = 0

    try {
      switch (this.config.type) {
        case 'questdb':
          // Use ILP (InfluxDB Line Protocol) for efficient batch writes
          const ilpData = records.map(r => this.toILP(r)).join('\n')
          const ilpResponse = await fetch(`${this.getBaseUrl()}/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: ilpData
          })
          
          if (ilpResponse.ok) {
            successCount = records.length
            this.stats.bytesWritten += ilpData.length
          } else {
            const errorText = await ilpResponse.text()
            errors.push(`QuestDB write error: ${errorText}`)
          }
          break

        case 'clickhouse':
          // Use JSONEachRow format for batch insert
          const insertQuery = `INSERT INTO ${this.config.database || 'default'}.crypto_signatures FORMAT JSONEachRow`
          const jsonData = records.map(r => JSON.stringify(this.toClickHouseRow(r))).join('\n')
          
          const chResponse = await fetch(`${this.getBaseUrl()}/`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: `${insertQuery}\n${jsonData}`
          })
          
          if (chResponse.ok) {
            successCount = records.length
            this.stats.bytesWritten += jsonData.length
          } else {
            const errorText = await chResponse.text()
            errors.push(`ClickHouse write error: ${errorText}`)
          }
          break

        case 'influxdb':
          // Use InfluxDB write API
          const lineProtocol = records.map(r => this.toInfluxLP(r)).join('\n')
          
          const influxResponse = await fetch(
            `${this.getBaseUrl()}/api/v2/write?org=${this.config.org || 'default'}&bucket=${this.config.bucket || 'crypto'}`,
            {
              method: 'POST',
              headers: {
                ...this.getAuthHeaders(),
                'Content-Type': 'text/plain'
              },
              body: lineProtocol
            }
          )
          
          if (influxResponse.ok) {
            successCount = records.length
            this.stats.bytesWritten += lineProtocol.length
          } else {
            const errorText = await influxResponse.text()
            errors.push(`InfluxDB write error: ${errorText}`)
          }
          break

        case 'cloudflare-d1':
          // Use D1 batch insert API
          const d1Statements = records.map(r => ({
            sql: `INSERT INTO crypto_signatures (
              r_value, s_value, z_hash, pubkey, address, tx_hash,
              input_index, block_id, timestamp, value_satoshis,
              sighash_type, signature_type, is_nonce_reuse, is_biased_nonce,
              is_small_r, is_related_nonce, r_leading_zeros, vulnerability_severity
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [
              r.r_value,
              r.s_value,
              r.z_hash,
              r.pubkey,
              r.address,
              r.tx_hash,
              r.input_index,
              r.block_id,
              r.timestamp,
              r.value_satoshis,
              r.sighash_type,
              r.signature_type,
              r.is_nonce_reuse ? 1 : 0,
              r.is_biased_nonce ? 1 : 0,
              r.is_small_r ? 1 : 0,
              r.is_related_nonce ? 1 : 0,
              r.r_leading_zeros,
              r.vulnerability_severity
            ]
          }))

          // D1 has a limit on batch size, so we chunk if needed
          for (let i = 0; i < d1Statements.length; i += D1_BATCH_SIZE) {
            const chunk = d1Statements.slice(i, i + D1_BATCH_SIZE)
            const d1Response = await fetch(`${this.getBaseUrl()}/query`, {
              method: 'POST',
              headers: this.getAuthHeaders(),
              body: JSON.stringify(chunk)
            })
            
            if (d1Response.ok) {
              successCount += chunk.length
              this.stats.bytesWritten += JSON.stringify(chunk).length
            } else {
              const errorText = await d1Response.text()
              errors.push(`Cloudflare D1 write error: ${errorText}`)
            }
          }
          break
      }

      // Update stats
      this.stats.totalStreamed += records.length
      this.stats.successCount += successCount
      this.stats.errorCount += records.length - successCount
      this.stats.lastStreamedAt = Date.now()
      
      if (errors.length > 0) {
        this.stats.errors.push(...errors)
        // Keep only last 100 errors
        if (this.stats.errors.length > 100) {
          this.stats.errors = this.stats.errors.slice(-100)
        }
      }

      return {
        success: successCount > 0,
        count: successCount,
        errors
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`Stream error: ${message}`)
      this.stats.errors.push(message)
      return { success: false, count: 0, errors }
    }
  }

  /**
   * Escape special characters for InfluxDB Line Protocol
   * Line protocol requires escaping of: spaces, commas, equals signs, and backslashes
   */
  private escapeILPTag(value: string): string {
    return value
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/,/g, '\\,')     // Escape commas
      .replace(/=/g, '\\=')     // Escape equals signs
      .replace(/ /g, '\\ ')     // Escape spaces
  }

  /**
   * Convert record to InfluxDB Line Protocol (used by QuestDB too)
   */
  private toILP(record: SignatureRecord): string {
    // Constant for timestamp conversion (milliseconds to nanoseconds)
    const MS_TO_NANOSECONDS = 1000000

    const measurement = 'crypto_signatures'
    const tags = [
      `signature_type=${record.signature_type}`,
      `sighash_type=${record.sighash_type}i`,
      `severity=${record.vulnerability_severity}`
    ]
    
    if (record.address) {
      tags.push(`address=${this.escapeILPTag(record.address)}`)
    }

    const fields = [
      `r_value="${record.r_value}"`,
      `s_value="${record.s_value}"`,
      `z_hash="${record.z_hash}"`,
      `tx_hash="${record.tx_hash}"`,
      `input_index=${record.input_index}i`,
      `block_id=${record.block_id}i`,
      `value_satoshis=${record.value_satoshis}i`,
      `r_leading_zeros=${record.r_leading_zeros}i`,
      `is_nonce_reuse=${record.is_nonce_reuse}`,
      `is_biased_nonce=${record.is_biased_nonce}`,
      `is_small_r=${record.is_small_r}`,
      `is_related_nonce=${record.is_related_nonce}`
    ]

    if (record.pubkey) {
      fields.push(`pubkey="${record.pubkey}"`)
    }

    // Timestamp in nanoseconds
    const timestamp = record.timestamp * MS_TO_NANOSECONDS

    return `${measurement},${tags.join(',')} ${fields.join(',')} ${timestamp}`
  }

  /**
   * Convert record to InfluxDB Line Protocol format
   */
  private toInfluxLP(record: SignatureRecord): string {
    return this.toILP(record)
  }

  /**
   * Convert record to ClickHouse row format
   */
  private toClickHouseRow(record: SignatureRecord): Record<string, unknown> {
    // Safely parse value_satoshis, defaulting to 0n if invalid
    let valueSatoshis: bigint
    try {
      valueSatoshis = record.value_satoshis ? BigInt(record.value_satoshis) : 0n
    } catch {
      valueSatoshis = 0n
    }

    return {
      r_value: record.r_value,
      s_value: record.s_value,
      z_hash: record.z_hash,
      pubkey: record.pubkey,
      address: record.address,
      tx_hash: record.tx_hash,
      input_index: record.input_index,
      block_id: record.block_id,
      timestamp: new Date(record.timestamp).toISOString(),
      value_satoshis: valueSatoshis,
      sighash_type: record.sighash_type,
      signature_type: record.signature_type,
      is_nonce_reuse: record.is_nonce_reuse,
      is_biased_nonce: record.is_biased_nonce,
      is_small_r: record.is_small_r,
      is_related_nonce: record.is_related_nonce,
      r_leading_zeros: record.r_leading_zeros,
      vulnerability_severity: record.vulnerability_severity
    }
  }

  /**
   * Query for nonce reuse vulnerabilities
   */
  async queryNonceReuse(): Promise<{ success: boolean; data?: SignatureRecord[][]; message?: string }> {
    let query: string

    switch (this.config.type) {
      case 'questdb':
        query = `
          SELECT * FROM crypto_signatures 
          WHERE r_value IN (
            SELECT r_value FROM crypto_signatures 
            GROUP BY r_value 
            HAVING count(*) > 1
          )
          ORDER BY r_value, timestamp
        `
        break

      case 'clickhouse':
        query = `
          SELECT * FROM ${this.config.database || 'default'}.crypto_signatures 
          WHERE r_value IN (
            SELECT r_value FROM ${this.config.database || 'default'}.crypto_signatures 
            GROUP BY r_value 
            HAVING count(*) > 1
          )
          ORDER BY r_value, timestamp
        `
        break

      case 'cloudflare-d1':
        query = `
          SELECT * FROM crypto_signatures 
          WHERE r_value IN (
            SELECT r_value FROM crypto_signatures 
            GROUP BY r_value 
            HAVING count(*) > 1
          )
          ORDER BY r_value, timestamp
        `
        break

      default:
        return { success: false, message: 'Query not supported for this database type' }
    }

    return this.executeQuery(query) as Promise<{ success: boolean; data?: SignatureRecord[][]; message?: string }>
  }

  /**
   * Query for biased nonces (high leading zeros)
   */
  async queryBiasedNonces(minLeadingZeros: number = 10): Promise<{ success: boolean; data?: SignatureRecord[]; message?: string }> {
    let query: string

    switch (this.config.type) {
      case 'questdb':
        query = `
          SELECT * FROM crypto_signatures 
          WHERE r_leading_zeros >= ${minLeadingZeros}
          ORDER BY r_leading_zeros DESC, timestamp
          LIMIT 1000
        `
        break

      case 'clickhouse':
        query = `
          SELECT * FROM ${this.config.database || 'default'}.crypto_signatures 
          WHERE r_leading_zeros >= ${minLeadingZeros}
          ORDER BY r_leading_zeros DESC, timestamp
          LIMIT 1000
        `
        break

      case 'cloudflare-d1':
        query = `
          SELECT * FROM crypto_signatures 
          WHERE r_leading_zeros >= ${minLeadingZeros}
          ORDER BY r_leading_zeros DESC, timestamp
          LIMIT 1000
        `
        break

      default:
        return { success: false, message: 'Query not supported for this database type' }
    }

    return this.executeQuery(query) as Promise<{ success: boolean; data?: SignatureRecord[]; message?: string }>
  }

  /**
   * Get streaming statistics
   */
  getStats(): StreamingStats {
    return { ...this.stats }
  }

  /**
   * Reset streaming statistics
   */
  resetStats(): void {
    this.stats = {
      totalStreamed: 0,
      successCount: 0,
      errorCount: 0,
      lastStreamedAt: null,
      bytesWritten: 0,
      errors: []
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): DatabaseConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DatabaseConfig>): void {
    this.config = { ...this.config, ...config }
    this.isConnected = false
  }

  /**
   * Check if client is connected
   */
  isClientConnected(): boolean {
    return this.isConnected
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let databaseClientInstance: DatabaseClient | null = null

export function getDatabaseClient(): DatabaseClient {
  if (!databaseClientInstance) {
    databaseClientInstance = new DatabaseClient()
  }
  return databaseClientInstance
}

export function resetDatabaseClient(): void {
  databaseClientInstance = null
}
