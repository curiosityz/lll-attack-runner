/**
 * Blockchain Data Client for Browser-based Storage
 * 
 * This module provides IndexedDB-based storage for:
 * - Storing and querying Bitcoin blockchain data from Blockchair dumps
 * - Extracting ECDSA signature components (R, S) from inputs
 * - Calculating message hashes (Z) for cryptographic analysis
 * - Detecting signature vulnerabilities (nonce reuse, biased nonces, etc.)
 * 
 * Uses IndexedDB for persistent browser storage without external dependencies.
 */

import { 
  ExtractedSignature, 
  parseDERSignature, 
  parseWitnessStack, 
  parseLegacyScriptSig,
  BlockchairInput,
  parseInputsTSV,
  parseOutputsTSV,
  parseTransactionsTSV
} from './blockchair-parser'

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

interface StoredSignature {
  id: string
  r: string
  s: string
  z: string
  transactionHash: string
  inputIndex: number
  blockId: number
  timestamp: number
  value: string
  address?: string
  publicKey?: string
  sighashType: number
  signatureType: string
  rLeadingZeros: number
  isNonceReuse: boolean
  isBiasedNonce: boolean
  isSmallR: boolean
  vulnerabilitySeverity: string
}

interface StoredInput {
  id: string
  blockId: number
  transactionHash: string
  inputIndex: number
  time: string
  value: string
  recipient?: string
  type?: string
  scriptHex?: string
  spendingSignatureHex?: string
  spendingWitnessHex?: string
}

interface StoredOutput {
  id: string
  blockId: number
  transactionHash: string
  outputIndex: number
  time: string
  value: string
  recipient?: string
  type?: string
  scriptPubKeyHex?: string
  isSpent: boolean
}

interface StoredTransaction {
  hash: string
  blockId: number
  time: string
  size: number
  weight: number
  version: number
  lockTime: number
  isCoinbase: boolean
  hasWitness: boolean
  inputCount: number
  outputCount: number
  inputTotal: string
  outputTotal: string
  fee: string
}

// ============================================================================
// IndexedDB Database Client
// ============================================================================

const DB_NAME = 'blockchain_data'
const DB_VERSION = 1

const STORE_NAMES = {
  signatures: 'signatures',
  inputs: 'inputs',
  outputs: 'outputs',
  transactions: 'transactions'
} as const

export class DuckDBClient {
  private db: IDBDatabase | null = null
  private config: DuckDBConfig
  private isInitialized = false
  private initPromise: Promise<void> | null = null
  private signatureIdCounter = 0

  constructor(config: DuckDBConfig = {}) {
    this.config = {
      persistToIndexedDB: true,
      databaseName: DB_NAME,
      ...config
    }
  }

  /**
   * Initialize IndexedDB database
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this._doInitialize()
    return this.initPromise
  }

  private async _doInitialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.databaseName || DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('[BlockchainDB] Failed to open database:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        this.isInitialized = true
        console.log('[BlockchainDB] Initialized successfully')
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Signatures store
        if (!db.objectStoreNames.contains(STORE_NAMES.signatures)) {
          const sigStore = db.createObjectStore(STORE_NAMES.signatures, { keyPath: 'id' })
          sigStore.createIndex('r', 'r', { unique: false })
          sigStore.createIndex('transactionHash', 'transactionHash', { unique: false })
          sigStore.createIndex('blockId', 'blockId', { unique: false })
          sigStore.createIndex('isNonceReuse', 'isNonceReuse', { unique: false })
          sigStore.createIndex('isBiasedNonce', 'isBiasedNonce', { unique: false })
          sigStore.createIndex('rLeadingZeros', 'rLeadingZeros', { unique: false })
        }

        // Inputs store
        if (!db.objectStoreNames.contains(STORE_NAMES.inputs)) {
          const inputStore = db.createObjectStore(STORE_NAMES.inputs, { keyPath: 'id' })
          inputStore.createIndex('transactionHash', 'transactionHash', { unique: false })
          inputStore.createIndex('blockId', 'blockId', { unique: false })
        }

        // Outputs store
        if (!db.objectStoreNames.contains(STORE_NAMES.outputs)) {
          const outputStore = db.createObjectStore(STORE_NAMES.outputs, { keyPath: 'id' })
          outputStore.createIndex('transactionHash', 'transactionHash', { unique: false })
          outputStore.createIndex('blockId', 'blockId', { unique: false })
        }

        // Transactions store
        if (!db.objectStoreNames.contains(STORE_NAMES.transactions)) {
          const txStore = db.createObjectStore(STORE_NAMES.transactions, { keyPath: 'hash' })
          txStore.createIndex('blockId', 'blockId', { unique: false })
        }

        console.log('[BlockchainDB] Schema initialized')
      }
    })
  }

  /**
   * Import data from decompressed TSV content
   */
  async importFromTSVContent(content: string, tableName: string): Promise<number> {
    if (!this.db) throw new Error('Database not connected')

    try {
      let rowsImported = 0

      if (tableName === 'bitcoin_inputs') {
        const inputs = parseInputsTSV(content)
        await this.storeInputs(inputs)
        rowsImported = inputs.length
      } else if (tableName === 'bitcoin_outputs') {
        const outputs = parseOutputsTSV(content)
        await this.storeOutputs(outputs)
        rowsImported = outputs.length
      } else if (tableName === 'bitcoin_transactions') {
        const transactions = parseTransactionsTSV(content)
        await this.storeTransactions(transactions)
        rowsImported = transactions.length
      }

      console.log(`[BlockchainDB] Imported ${rowsImported} rows into ${tableName}`)
      return rowsImported
    } catch (error) {
      console.error(`[BlockchainDB] Import error:`, error)
      throw error
    }
  }

  private async storeInputs(inputs: BlockchairInput[]): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.inputs], 'readwrite')
      const store = transaction.objectStore(STORE_NAMES.inputs)

      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()

      for (const input of inputs) {
        const stored: StoredInput = {
          id: `${input.transactionHash}-${input.index}`,
          blockId: input.blockId,
          transactionHash: input.transactionHash,
          inputIndex: input.index,
          time: input.time,
          value: input.value.toString(),
          recipient: input.recipient,
          type: input.type,
          scriptHex: input.scriptHex,
          spendingSignatureHex: input.spendingSignatureHex,
          spendingWitnessHex: input.spendingWitnessHex
        }
        store.put(stored)
      }
    })
  }

  private async storeOutputs(outputs: { blockId: number; transactionHash: string; index: number; time: string; value: bigint; recipient?: string; type?: string; scriptPubKeyHex?: string; isSpent: boolean }[]): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.outputs], 'readwrite')
      const store = transaction.objectStore(STORE_NAMES.outputs)

      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()

      for (const output of outputs) {
        const stored: StoredOutput = {
          id: `${output.transactionHash}-${output.index}`,
          blockId: output.blockId,
          transactionHash: output.transactionHash,
          outputIndex: output.index,
          time: output.time,
          value: output.value.toString(),
          recipient: output.recipient,
          type: output.type,
          scriptPubKeyHex: output.scriptPubKeyHex,
          isSpent: output.isSpent
        }
        store.put(stored)
      }
    })
  }

  private async storeTransactions(transactions: { blockId: number; hash: string; time: string; size: number; weight: number; version: number; lockTime: number; isCoinbase: boolean; hasWitness: boolean; inputCount: number; outputCount: number; inputTotal: bigint; outputTotal: bigint; fee: bigint }[]): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.transactions], 'readwrite')
      const store = transaction.objectStore(STORE_NAMES.transactions)

      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()

      for (const tx of transactions) {
        const stored: StoredTransaction = {
          hash: tx.hash,
          blockId: tx.blockId,
          time: tx.time,
          size: tx.size,
          weight: tx.weight,
          version: tx.version,
          lockTime: tx.lockTime,
          isCoinbase: tx.isCoinbase,
          hasWitness: tx.hasWitness,
          inputCount: tx.inputCount,
          outputCount: tx.outputCount,
          inputTotal: tx.inputTotal.toString(),
          outputTotal: tx.outputTotal.toString(),
          fee: tx.fee.toString()
        }
        store.put(stored)
      }
    })
  }

  /**
   * Extract signatures from imported inputs data
   */
  async extractSignatures(): Promise<number> {
    if (!this.db) throw new Error('Database not connected')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.inputs, STORE_NAMES.signatures], 'readwrite')
      const inputStore = transaction.objectStore(STORE_NAMES.inputs)
      const sigStore = transaction.objectStore(STORE_NAMES.signatures)

      let extractedCount = 0
      const request = inputStore.openCursor()

      request.onerror = () => reject(request.error)

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          const input = cursor.value as StoredInput
          
          // Try to extract signature from witness or scriptSig
          let sigData: { r: bigint; s: bigint; sighashType: number } | null = null
          let publicKey: string | null = null
          let signatureType: 'legacy' | 'segwit' = 'legacy'

          if (input.spendingWitnessHex && input.spendingWitnessHex.length > 10) {
            const witnessResult = parseWitnessStack(input.spendingWitnessHex)
            if (witnessResult.signature) {
              sigData = witnessResult.signature
              publicKey = witnessResult.publicKey
              signatureType = 'segwit'
            }
          }

          if (!sigData && input.spendingSignatureHex && input.spendingSignatureHex.length > 10) {
            const legacyResult = parseLegacyScriptSig(input.spendingSignatureHex)
            if (legacyResult.signature) {
              sigData = legacyResult.signature
              publicKey = legacyResult.publicKey
              signatureType = 'legacy'
            }
          }

          if (sigData) {
            const rHex = sigData.r.toString(16).padStart(64, '0')
            const sHex = sigData.s.toString(16).padStart(64, '0')
            
            // Calculate leading zeros in R
            const rBits = sigData.r.toString(2)
            const leadingZeros = 256 - rBits.length

            // Calculate Z placeholder (transaction hash for now)
            const zHex = input.transactionHash.startsWith('0x') 
              ? input.transactionHash.slice(2) 
              : input.transactionHash

            const stored: StoredSignature = {
              id: `sig-${this.signatureIdCounter++}`,
              r: rHex,
              s: sHex,
              z: zHex,
              transactionHash: input.transactionHash,
              inputIndex: input.inputIndex,
              blockId: input.blockId,
              timestamp: new Date(input.time).getTime(),
              value: input.value,
              address: input.recipient,
              publicKey: publicKey || undefined,
              sighashType: sigData.sighashType,
              signatureType,
              rLeadingZeros: leadingZeros,
              isNonceReuse: false,
              isBiasedNonce: leadingZeros > 10,
              isSmallR: false,
              vulnerabilitySeverity: leadingZeros > 20 ? 'critical' : leadingZeros > 10 ? 'high' : 'none'
            }

            sigStore.put(stored)
            extractedCount++
          }

          cursor.continue()
        } else {
          resolve(extractedCount)
        }
      }
    })
  }

  /**
   * Calculate Z (message hash) for signatures - placeholder
   */
  async calculateZ(): Promise<number> {
    // In a full implementation, this would calculate the actual sighash
    // For now, we're using the transaction hash as a placeholder
    console.log('[BlockchainDB] Z calculation uses transaction hash as placeholder')
    return 0
  }

  /**
   * Detect nonce reuse (same R value with different Z)
   */
  async detectNonceReuse(): Promise<{ rValue: string; count: number; signatures: string[] }[]> {
    if (!this.db) throw new Error('Database not connected')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.signatures], 'readwrite')
      const store = transaction.objectStore(STORE_NAMES.signatures)

      const rValueMap = new Map<string, StoredSignature[]>()
      const request = store.openCursor()

      request.onerror = () => reject(request.error)

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          const sig = cursor.value as StoredSignature
          if (!rValueMap.has(sig.r)) {
            rValueMap.set(sig.r, [])
          }
          rValueMap.get(sig.r)!.push(sig)
          cursor.continue()
        } else {
          // Process results
          const reused: { rValue: string; count: number; signatures: string[] }[] = []
          
          for (const [rValue, sigs] of rValueMap.entries()) {
            if (sigs.length > 1) {
              reused.push({
                rValue,
                count: sigs.length,
                signatures: sigs.map(s => s.transactionHash)
              })

              // Mark as nonce reuse
              for (const sig of sigs) {
                sig.isNonceReuse = true
                sig.vulnerabilitySeverity = 'critical'
                store.put(sig)
              }
            }
          }

          resolve(reused.sort((a, b) => b.count - a.count).slice(0, 1000))
        }
      }
    })
  }

  /**
   * Detect biased nonces (signatures with many leading zeros in R)
   */
  async detectBiasedNonces(minLeadingZeros: number = 10): Promise<number> {
    if (!this.db) throw new Error('Database not connected')

    const sanitizedMinZeros = Math.max(0, Math.min(256, Math.floor(Number(minLeadingZeros) || 10)))

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.signatures], 'readwrite')
      const store = transaction.objectStore(STORE_NAMES.signatures)

      let count = 0
      const request = store.openCursor()

      request.onerror = () => reject(request.error)

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          const sig = cursor.value as StoredSignature
          if (sig.rLeadingZeros >= sanitizedMinZeros) {
            sig.isBiasedNonce = true
            sig.vulnerabilitySeverity = sig.rLeadingZeros > 20 ? 'critical' : 
                                        sig.rLeadingZeros > 15 ? 'high' : 'medium'
            store.put(sig)
            count++
          }
          cursor.continue()
        } else {
          resolve(count)
        }
      }
    })
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
    if (!this.db) throw new Error('Database not connected')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.signatures], 'readonly')
      const store = transaction.objectStore(STORE_NAMES.signatures)

      let total = 0
      let nonceReuse = 0
      let biasedNonces = 0
      let smallR = 0
      const bySeverity: Record<string, number> = {}

      const request = store.openCursor()

      request.onerror = () => reject(request.error)

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          const sig = cursor.value as StoredSignature
          total++
          if (sig.isNonceReuse) nonceReuse++
          if (sig.isBiasedNonce) biasedNonces++
          if (sig.isSmallR) smallR++
          bySeverity[sig.vulnerabilitySeverity] = (bySeverity[sig.vulnerabilitySeverity] || 0) + 1
          cursor.continue()
        } else {
          resolve({ totalSignatures: total, nonceReuse, biasedNonces, smallR, bySeverity })
        }
      }
    })
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
    if (!this.db) throw new Error('Database not connected')

    const { limit = 100, offset = 0, onlyVulnerable = false, minLeadingZeros } = options
    const sanitizedLimit = Math.max(1, Math.min(10000, Math.floor(Number(limit) || 100)))
    const sanitizedOffset = Math.max(0, Math.floor(Number(offset) || 0))

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.signatures], 'readonly')
      const store = transaction.objectStore(STORE_NAMES.signatures)

      const results: SignatureWithZ[] = []
      let skipped = 0
      const request = store.openCursor()

      request.onerror = () => reject(request.error)

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor && results.length < sanitizedLimit) {
          const sig = cursor.value as StoredSignature

          // Apply filters
          if (onlyVulnerable && !sig.isNonceReuse && !sig.isBiasedNonce && !sig.isSmallR) {
            cursor.continue()
            return
          }
          if (minLeadingZeros !== undefined && sig.rLeadingZeros < minLeadingZeros) {
            cursor.continue()
            return
          }

          // Skip for offset
          if (skipped < sanitizedOffset) {
            skipped++
            cursor.continue()
            return
          }

          results.push({
            r: sig.r,
            s: sig.s,
            z: sig.z,
            txHash: sig.transactionHash,
            inputIndex: sig.inputIndex,
            blockId: sig.blockId,
            timestamp: sig.timestamp,
            address: sig.address,
            publicKey: sig.publicKey,
            value: sig.value
          })

          cursor.continue()
        } else {
          resolve(results)
        }
      }
    })
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
    if (!this.db) throw new Error('Database not connected')

    const getCount = (storeName: string): Promise<number> => {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readonly')
        const store = transaction.objectStore(storeName)
        const request = store.count()
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)
      })
    }

    const [outputs, inputs, transactions, signatures] = await Promise.all([
      getCount(STORE_NAMES.outputs),
      getCount(STORE_NAMES.inputs),
      getCount(STORE_NAMES.transactions),
      getCount(STORE_NAMES.signatures)
    ])

    return { outputs, inputs, transactions, signatures }
  }

  /**
   * Check if the client is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.db !== null
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
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
