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
import { calculateBitcoinSighash, RawTransaction } from './sighashCalculator'
import { ripemd160, sha256, hexToBytes, bytesToHex } from './crypto-utils'

// ============================================================================
// Types and Interfaces
// ============================================================================

// Bitcoin sighash type constants
const SIGHASH_ALL = 1
const SIGHASH_NONE = 2
const SIGHASH_SINGLE = 3
const SIGHASH_ANYONECANPAY = 0x80

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
  scriptPubKeyHex?: string  // Script of the output being spent (needed for sighash)
  spendingSignatureHex?: string
  spendingWitnessHex?: string
  spendingSequence?: number
  spendingNLocktime?: number
  // Reference to spent output for sighash reconstruction
  spentTxHash?: string
  spentVout?: number
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
          scriptPubKeyHex: input.scriptPubKeyHex,
          spendingSignatureHex: input.spendingSignatureHex,
          spendingWitnessHex: input.spendingWitnessHex,
          spendingSequence: input.spendingSequence,
          spendingNLocktime: input.spendingNLocktime,
          spentTxHash: input.spendingTransactionHash,
          spentVout: input.spendingIndex
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
   * Calculate Z (message hash / sighash) for signatures
   * 
   * For Bitcoin, Z is the double SHA256 hash of the transaction pre-image.
   * The pre-image is constructed by:
   * 1. Serializing the transaction with scriptPubKey in the input being signed
   * 2. Appending the sighash type (usually SIGHASH_ALL = 0x01)
   * 3. Double SHA256 hashing the result
   * 
   * This requires:
   * - Transaction version, inputs, outputs, and locktime
   * - The scriptPubKey of the output being spent
   * - The sighash type from the signature
   */
  async calculateZ(): Promise<number> {
    if (!this.db) throw new Error('Database not connected')

    console.log('[BlockchainDB] Starting Z (sighash) calculation...')

    // Get all signatures that need Z calculation
    const sigsNeedingZ = await this.getSignaturesNeedingZCalculation()
    
    if (sigsNeedingZ.length === 0) {
      console.log('[BlockchainDB] No signatures need Z calculation')
      return 0
    }

    console.log(`[BlockchainDB] Found ${sigsNeedingZ.length} signatures needing Z calculation`)

    let calculatedCount = 0
    const batchSize = 100

    for (let i = 0; i < sigsNeedingZ.length; i += batchSize) {
      const batch = sigsNeedingZ.slice(i, i + batchSize)
      
      for (const sig of batch) {
        try {
          const z = await this.calculateSighashForSignature(sig)
          if (z) {
            await this.updateSignatureZ(sig.id, z)
            calculatedCount++
          }
        } catch (error) {
          console.warn(`[BlockchainDB] Failed to calculate Z for ${sig.transactionHash}:${sig.inputIndex}:`, error)
        }
      }

      // Log progress
      if ((i + batchSize) % 1000 === 0 || i + batchSize >= sigsNeedingZ.length) {
        console.log(`[BlockchainDB] Z calculation progress: ${Math.min(i + batchSize, sigsNeedingZ.length)}/${sigsNeedingZ.length}`)
      }
    }

    console.log(`[BlockchainDB] Calculated Z for ${calculatedCount} signatures`)
    return calculatedCount
  }

  /**
   * Get signatures that have placeholder Z (transaction hash) or empty Z
   */
  private async getSignaturesNeedingZCalculation(): Promise<StoredSignature[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.signatures], 'readonly')
      const store = transaction.objectStore(STORE_NAMES.signatures)
      const signatures: StoredSignature[] = []

      const request = store.openCursor()
      request.onerror = () => reject(request.error)
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          const sig = cursor.value as StoredSignature
          // Check if Z is empty or is just the transaction hash (placeholder)
          // Normalize transaction hash once for comparison
          const normalizedTxHash = sig.transactionHash.startsWith('0x') 
            ? sig.transactionHash.slice(2) 
            : sig.transactionHash
          const needsCalculation = !sig.z || 
                                   sig.z === '' || 
                                   sig.z === sig.transactionHash || 
                                   sig.z === normalizedTxHash
          if (needsCalculation) {
            signatures.push(sig)
          }
          cursor.continue()
        } else {
          resolve(signatures)
        }
      }
    })
  }

  /**
   * Calculate the actual sighash for a signature using the transaction pre-image
   */
  private async calculateSighashForSignature(sig: StoredSignature): Promise<string | null> {
    // Get all inputs for this transaction to reconstruct the pre-image
    const txInputs = await this.getInputsForTransaction(sig.transactionHash)
    const txOutputs = await this.getOutputsForTransaction(sig.transactionHash)
    const txData = await this.getTransactionData(sig.transactionHash)

    // Check if we have the minimum required data
    if (!txInputs.length) {
      console.warn(`[BlockchainDB] No inputs found for ${sig.transactionHash}`)
      return null
    }
    
    if (!txOutputs.length) {
      console.warn(`[BlockchainDB] No outputs found for ${sig.transactionHash}`)
      return null
    }

    // Find the input data for the signature we're calculating
    const inputData = txInputs.find(i => i.inputIndex === sig.inputIndex)
    if (!inputData) {
      console.warn(`[BlockchainDB] No input data found for ${sig.transactionHash}:${sig.inputIndex}`)
      return null
    }

    // The scriptPubKey should be from the output being spent
    // If we have it directly in the input data, use it
    let scriptPubKey = inputData.scriptPubKeyHex

    // If not available, try to look it up from outputs table
    if (!scriptPubKey && inputData.spentTxHash && inputData.spentVout !== undefined) {
      const spentOutput = await this.getOutput(inputData.spentTxHash, inputData.spentVout)
      if (spentOutput?.scriptPubKeyHex) {
        scriptPubKey = spentOutput.scriptPubKeyHex
      }
    }

    if (!scriptPubKey) {
      // Last resort: derive from scriptHex if it's a P2PKH/P2SH spending script
      scriptPubKey = await this.deriveScriptPubKeyFromScriptSig(inputData.scriptHex || '')
    }

    if (!scriptPubKey) {
      console.warn(`[BlockchainDB] No scriptPubKey available for ${sig.transactionHash}:${sig.inputIndex}`)
      return null
    }

    return await this.calculateSighashWithScriptPubKey(
      sig,
      scriptPubKey,
      txData?.version || 1,
      txData?.lockTime || 0,
      txInputs,
      txOutputs
    )
  }

  /**
   * Calculate sighash with the provided scriptPubKey
   */
  private async calculateSighashWithScriptPubKey(
    sig: StoredSignature,
    scriptPubKey: string,
    version: number,
    lockTime: number,
    inputs: StoredInput[],
    outputs: StoredOutput[]
  ): Promise<string> {
    // Validate that we have the required spent output references
    // Each input must know which output it's spending (spentTxHash, spentVout)
    const validInputs = inputs.filter(input => 
      input.spentTxHash && input.spentVout !== undefined
    )
    
    if (validInputs.length !== inputs.length) {
      console.warn(`[BlockchainDB] Some inputs missing spent output references for ${sig.transactionHash}`)
    }

    // Reconstruct the transaction structure for sighash calculation
    // Note: For proper sighash calculation, we need the txid of the transaction
    // that created the output being spent (spentTxHash), not the current transaction
    const rawTx: RawTransaction = {
      version: version,
      vin: inputs.map(input => {
        // spentTxHash is the txid of the previous transaction that created the UTXO
        // spentVout is the output index in that previous transaction
        if (!input.spentTxHash || input.spentVout === undefined) {
          // Cannot calculate sighash without proper UTXO reference
          throw new Error(`Missing spent output reference for input ${input.inputIndex}`)
        }
        return {
          txid: input.spentTxHash,
          vout: input.spentVout,
          scriptSig: '', // Will be replaced during sighash calculation
          sequence: input.spendingSequence || 0xffffffff
        }
      }),
      vout: outputs.map(output => ({
        // Use Number for value - Bitcoin values in satoshis fit in safe integer range
        // for most transactions (max 21M BTC * 100M sats = 2.1e15 < Number.MAX_SAFE_INTEGER)
        value: Number(output.value) || 0,
        scriptPubKey: output.scriptPubKeyHex || ''
      })),
      locktime: lockTime
    }

    // Calculate the sighash using the existing calculator
    const sighash = await calculateBitcoinSighash(
      rawTx,
      sig.inputIndex,
      scriptPubKey,
      sig.sighashType || SIGHASH_ALL
    )

    // Return without 0x prefix for consistency
    return sighash.startsWith('0x') ? sighash.slice(2) : sighash
  }

  /**
   * Derive scriptPubKey from a spending scriptSig (for P2PKH)
   * For P2PKH spending: scriptSig = <sig> <pubkey>
   * The corresponding scriptPubKey is: OP_DUP OP_HASH160 <pubkeyhash> OP_EQUALVERIFY OP_CHECKSIG
   * 
   * Note: This is a last resort fallback. Ideally, the scriptPubKey should be
   * available from the outputs table via the spent output reference.
   */
  private async deriveScriptPubKeyFromScriptSig(scriptSig: string): Promise<string | null> {
    if (!scriptSig || scriptSig.length < 66) return null

    try {
      const hex = scriptSig.startsWith('0x') ? scriptSig.slice(2) : scriptSig
      
      // Parse the scriptSig to find the public key
      // For P2PKH: first push is signature, second push is pubkey
      let pos = 0
      
      // Skip signature (first push)
      const sigPushLen = parseInt(hex.substring(pos, pos + 2), 16)
      pos += 2
      if (sigPushLen > 0 && sigPushLen < 0x4c) {
        pos += sigPushLen * 2
      } else {
        return null // Invalid push opcode
      }
      
      // Get public key (second push)
      if (pos >= hex.length) return null
      
      const pubKeyPushLen = parseInt(hex.substring(pos, pos + 2), 16)
      pos += 2
      
      if (pubKeyPushLen !== 0x21 && pubKeyPushLen !== 0x41) {
        return null // Not a valid pubkey length (33 or 65 bytes)
      }
      
      // 33 bytes (compressed) or 65 bytes (uncompressed) public key
      const pubKeyHex = hex.substring(pos, pos + pubKeyPushLen * 2)
      if (pubKeyHex.length !== pubKeyPushLen * 2) return null
      
      // Compute pubkeyhash = RIPEMD160(SHA256(pubkey))
      const pubKeyBytes = hexToBytes(pubKeyHex)
      
      // SHA256 first using imported function
      const sha256Hash = await sha256(pubKeyBytes)
      
      // RIPEMD160 using imported function
      const pubKeyHash = ripemd160(sha256Hash)
      
      // Build P2PKH scriptPubKey: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
      // = 76 a9 14 <pubkeyhash> 88 ac
      const scriptPubKey = '76a914' + bytesToHex(pubKeyHash) + '88ac'
      return scriptPubKey
      
    } catch (error) {
      console.warn('[BlockchainDB] Failed to parse scriptSig:', error)
      return null
    }
  }

  /**
   * Convert hex string to Uint8Array
   */
  private hexToBytes(hex: string): Uint8Array {
    return hexToBytes(hex)
  }

  /**
   * Get all inputs for a transaction
   */
  private async getInputsForTransaction(txHash: string): Promise<StoredInput[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.inputs], 'readonly')
      const store = transaction.objectStore(STORE_NAMES.inputs)
      const index = store.index('transactionHash')
      const inputs: StoredInput[] = []

      const request = index.openCursor(IDBKeyRange.only(txHash))
      request.onerror = () => reject(request.error)
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          inputs.push(cursor.value)
          cursor.continue()
        } else {
          resolve(inputs.sort((a, b) => a.inputIndex - b.inputIndex))
        }
      }
    })
  }

  /**
   * Get all outputs for a transaction
   */
  private async getOutputsForTransaction(txHash: string): Promise<StoredOutput[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.outputs], 'readonly')
      const store = transaction.objectStore(STORE_NAMES.outputs)
      const index = store.index('transactionHash')
      const outputs: StoredOutput[] = []

      const request = index.openCursor(IDBKeyRange.only(txHash))
      request.onerror = () => reject(request.error)
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          outputs.push(cursor.value)
          cursor.continue()
        } else {
          resolve(outputs.sort((a, b) => a.outputIndex - b.outputIndex))
        }
      }
    })
  }

  /**
   * Get transaction metadata
   */
  private async getTransactionData(txHash: string): Promise<StoredTransaction | null> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.transactions], 'readonly')
      const store = transaction.objectStore(STORE_NAMES.transactions)

      const request = store.get(txHash)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  }

  /**
   * Get a specific output by transaction hash and index
   */
  private async getOutput(txHash: string, index: number): Promise<StoredOutput | null> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.outputs], 'readonly')
      const store = transaction.objectStore(STORE_NAMES.outputs)

      const request = store.get(`${txHash}-${index}`)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  }

  /**
   * Update a signature's Z value
   */
  private async updateSignatureZ(sigId: string, z: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.signatures], 'readwrite')
      const store = transaction.objectStore(STORE_NAMES.signatures)

      const getRequest = store.get(sigId)
      getRequest.onerror = () => reject(getRequest.error)
      getRequest.onsuccess = () => {
        const sig = getRequest.result as StoredSignature
        if (sig) {
          sig.z = z
          const putRequest = store.put(sig)
          putRequest.onerror = () => reject(putRequest.error)
          putRequest.onsuccess = () => resolve()
        } else {
          resolve()
        }
      }
    })
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
