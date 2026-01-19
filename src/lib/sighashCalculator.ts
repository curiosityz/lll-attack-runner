/**
 * Sighash Calculator Module
 * 
 * This module provides precise sighash calculation for all signature types:
 * 
 * Ethereum:
 * - Legacy transactions (pre-EIP-155)
 * - EIP-155 transactions (with chainId replay protection)
 * - EIP-2930 (Type 1) transactions
 * - EIP-1559 (Type 2) transactions
 * 
 * Bitcoin:
 * - SIGHASH_ALL (0x01) - Signs all inputs and outputs
 * - SIGHASH_NONE (0x02) - Signs all inputs, no outputs
 * - SIGHASH_SINGLE (0x03) - Signs all inputs, one output
 * - SIGHASH_ANYONECANPAY (0x80) - Modifier, signs only one input
 * - BIP-143 SegWit sighash
 */

import { keccak256 as keccak256Crypto } from './crypto-utils'

export interface RawTransaction {
  version?: number
  nonce?: number
  gasPrice?: string
  gasLimit?: string
  gas?: string  // Alias for gasLimit
  to?: string
  value?: string
  data?: string
  input?: string  // Alias for data
  chainId?: number
  
  // EIP-1559 fields
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  type?: number  // 0 = legacy, 1 = EIP-2930, 2 = EIP-1559
  accessList?: Array<{
    address: string
    storageKeys: string[]
  }>
  
  // Bitcoin fields
  vin?: Array<{
    txid: string
    vout: number
    scriptSig?: string
    sequence?: number
    witness?: string[]
  }>
  vout?: Array<{
    value: number
    scriptPubKey?: string
  }>
  locktime?: number
}

export interface TransactionWithSighash {
  rawTx: string
  sighash: string
  txType: 'ethereum' | 'bitcoin'
  r?: string
  s?: string
  v?: number
  sigType?: string  // e.g., 'EIP-155', 'legacy', 'EIP-1559', 'SIGHASH_ALL', etc.
}

// Bitcoin SIGHASH constants
export const SIGHASH_ALL = 0x01
export const SIGHASH_NONE = 0x02
export const SIGHASH_SINGLE = 0x03
export const SIGHASH_ANYONECANPAY = 0x80

// ============================================================================
// Utility Functions
// ============================================================================

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex
  if (cleaned.length === 0) return new Uint8Array(0)
  if (cleaned.length % 2 !== 0) {
    // Pad with leading zero if odd length
    return hexToBytes('0' + cleaned)
  }
  const bytes = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API not available')
  }
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as ArrayBuffer)
  return new Uint8Array(hashBuffer)
}

async function doubleSha256(data: Uint8Array): Promise<Uint8Array> {
  const hash1 = await sha256(data)
  return await sha256(hash1)
}

/**
 * Use the proper keccak256 implementation from crypto-utils
 * Note: We alias it to avoid confusion and for potential future flexibility
 */
const keccak256 = keccak256Crypto

// ============================================================================
// RLP Encoding Helpers (improved)
// ============================================================================

function rlpEncodeValue(data: string | Uint8Array | number | bigint): Uint8Array {
  let bytes: Uint8Array
  
  if (typeof data === 'number') {
    if (data === 0) return new Uint8Array([0x80])  // Empty string encoding
    bytes = hexToBytes(data.toString(16))
  } else if (typeof data === 'bigint') {
    if (data === 0n) return new Uint8Array([0x80])
    bytes = hexToBytes(data.toString(16))
  } else if (typeof data === 'string') {
    const cleaned = data.startsWith('0x') ? data.slice(2) : data
    if (cleaned === '' || cleaned === '0') return new Uint8Array([0x80])
    // Remove leading zeros for proper encoding
    const trimmed = cleaned.replace(/^0+/, '') || '0'
    bytes = hexToBytes(trimmed.length % 2 ? '0' + trimmed : trimmed)
  } else {
    bytes = data
  }
  
  if (bytes.length === 0) {
    return new Uint8Array([0x80])
  }
  
  if (bytes.length === 1 && bytes[0] < 128) {
    return bytes
  }
  
  return new Uint8Array([...encodeLength(bytes.length, 128), ...bytes])
}

function rlpEncode(data: any): Uint8Array {
  if (typeof data === 'string') {
    return rlpEncodeValue(data)
  }
  
  if (typeof data === 'number' || typeof data === 'bigint') {
    return rlpEncodeValue(data)
  }
  
  if (data instanceof Uint8Array) {
    return rlpEncodeValue(data)
  }
  
  if (Array.isArray(data)) {
    const encodedItems = data.map(item => rlpEncode(item))
    const totalLength = encodedItems.reduce((sum, item) => sum + item.length, 0)
    const prefix = encodeLength(totalLength, 192)
    
    const result = new Uint8Array(prefix.length + totalLength)
    result.set(prefix, 0)
    let offset = prefix.length
    for (const item of encodedItems) {
      result.set(item, offset)
      offset += item.length
    }
    return result
  }
  
  return new Uint8Array([0x80])  // Default: empty string
}

function encodeLength(length: number, offset: number): Uint8Array {
  if (length < 56) {
    return new Uint8Array([offset + length])
  }
  
  const hexLength = length.toString(16)
  const lengthBytes = hexToBytes(hexLength.length % 2 ? '0' + hexLength : hexLength)
  return new Uint8Array([offset + 55 + lengthBytes.length, ...lengthBytes])
}

// ============================================================================
// Ethereum Sighash Calculation
// ============================================================================

/**
 * Calculate Ethereum sighash for legacy transactions (pre-EIP-155)
 */
export function calculateLegacySighash(tx: RawTransaction): string {
  const fields = [
    tx.nonce ?? 0,
    tx.gasPrice || '0x',
    tx.gasLimit || tx.gas || '0x',
    tx.to || '0x',
    tx.value || '0x',
    tx.data || tx.input || '0x',
  ]
  
  const encoded = rlpEncode(fields)
  const hash = keccak256(encoded)
  return bytesToHex(hash)
}

/**
 * Calculate Ethereum sighash for EIP-155 transactions (with chainId)
 */
export function calculateEIP155Sighash(tx: RawTransaction): string {
  const chainId = tx.chainId ?? 1
  
  const fields = [
    tx.nonce ?? 0,
    tx.gasPrice || '0x',
    tx.gasLimit || tx.gas || '0x',
    tx.to || '0x',
    tx.value || '0x',
    tx.data || tx.input || '0x',
    chainId,
    0,  // Empty v for signing
    0,  // Empty r for signing
  ]
  
  const encoded = rlpEncode(fields)
  const hash = keccak256(encoded)
  return bytesToHex(hash)
}

/**
 * Encode access list for EIP-2930/EIP-1559
 */
function encodeAccessList(accessList?: Array<{ address: string; storageKeys: string[] }>): any[] {
  if (!accessList || accessList.length === 0) return []
  
  return accessList.map(item => [
    item.address,
    item.storageKeys || []
  ])
}

/**
 * Calculate Ethereum sighash for EIP-2930 (Type 1) transactions
 */
export function calculateEIP2930Sighash(tx: RawTransaction): string {
  const chainId = tx.chainId ?? 1
  
  const fields = [
    chainId,
    tx.nonce ?? 0,
    tx.gasPrice || '0x',
    tx.gasLimit || tx.gas || '0x',
    tx.to || '0x',
    tx.value || '0x',
    tx.data || tx.input || '0x',
    encodeAccessList(tx.accessList),
  ]
  
  const encoded = rlpEncode(fields)
  // Type 1 transactions have 0x01 prefix
  const prefixed = new Uint8Array(encoded.length + 1)
  prefixed[0] = 0x01
  prefixed.set(encoded, 1)
  
  const hash = keccak256(prefixed)
  return bytesToHex(hash)
}

/**
 * Calculate Ethereum sighash for EIP-1559 (Type 2) transactions
 */
export function calculateEIP1559Sighash(tx: RawTransaction): string {
  const chainId = tx.chainId ?? 1
  
  const fields = [
    chainId,
    tx.nonce ?? 0,
    tx.maxPriorityFeePerGas || '0x',
    tx.maxFeePerGas || '0x',
    tx.gasLimit || tx.gas || '0x',
    tx.to || '0x',
    tx.value || '0x',
    tx.data || tx.input || '0x',
    encodeAccessList(tx.accessList),
  ]
  
  const encoded = rlpEncode(fields)
  // Type 2 transactions have 0x02 prefix
  const prefixed = new Uint8Array(encoded.length + 1)
  prefixed[0] = 0x02
  prefixed.set(encoded, 1)
  
  const hash = keccak256(prefixed)
  return bytesToHex(hash)
}

/**
 * Main Ethereum sighash calculator - auto-detects transaction type
 */
export async function calculateEthereumSighash(tx: RawTransaction): Promise<string> {
  // Detect transaction type
  const txType = tx.type ?? (tx.maxFeePerGas ? 2 : tx.accessList ? 1 : 0)
  
  switch (txType) {
    case 2:
      return calculateEIP1559Sighash(tx)
    case 1:
      return calculateEIP2930Sighash(tx)
    case 0:
    default:
      // For legacy/EIP-155, check if chainId is present
      if (tx.chainId !== undefined && tx.chainId > 0) {
        return calculateEIP155Sighash(tx)
      }
      return calculateLegacySighash(tx)
  }
}

// ============================================================================
// Bitcoin Sighash Calculation Helpers
// ============================================================================

function serializeBitcoinInt(n: number): Uint8Array {
  const bytes = new Uint8Array(4)
  bytes[0] = n & 0xff
  bytes[1] = (n >>> 8) & 0xff
  bytes[2] = (n >>> 16) & 0xff
  bytes[3] = (n >>> 24) & 0xff
  return bytes
}

function serializeBitcoinInt64(value: number | bigint): Uint8Array {
  const bytes = new Uint8Array(8)
  const n = typeof value === 'bigint' ? value : BigInt(value)
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number((n >> BigInt(i * 8)) & 0xffn)
  }
  return bytes
}

function writeVarInt(n: number): Uint8Array {
  if (n < 0xfd) {
    return new Uint8Array([n])
  } else if (n <= 0xffff) {
    return new Uint8Array([0xfd, n & 0xff, (n >>> 8) & 0xff])
  } else if (n <= 0xffffffff) {
    return new Uint8Array([0xfe, n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])
  } else {
    return new Uint8Array([0xff, n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff, 0, 0, 0, 0])
  }
}

/**
 * Get the base hash type (without ANYONECANPAY modifier)
 */
function getBaseHashType(hashType: number): number {
  return hashType & 0x1f
}

/**
 * Check if ANYONECANPAY is set
 */
function isAnyoneCanPay(hashType: number): boolean {
  return (hashType & SIGHASH_ANYONECANPAY) !== 0
}

/**
 * Calculate legacy Bitcoin sighash (pre-SegWit)
 * Supports all SIGHASH types:
 * - SIGHASH_ALL (0x01): Sign all inputs and all outputs
 * - SIGHASH_NONE (0x02): Sign all inputs, no outputs
 * - SIGHASH_SINGLE (0x03): Sign all inputs, only the matching output
 * - SIGHASH_ANYONECANPAY (0x80): Modifier - sign only the current input
 */
export async function calculateBitcoinSighash(
  tx: RawTransaction,
  inputIndex: number,
  scriptPubKey: string,
  hashType: number = SIGHASH_ALL
): Promise<string> {
  const buffer: Uint8Array[] = []
  const baseHashType = getBaseHashType(hashType)
  const anyoneCanPay = isAnyoneCanPay(hashType)
  
  // Version (4 bytes, little-endian)
  buffer.push(serializeBitcoinInt(tx.version || 1))
  
  if (!tx.vin || tx.vin.length === 0) {
    throw new Error('Bitcoin transaction must have inputs')
  }
  
  // Inputs
  if (anyoneCanPay) {
    // SIGHASH_ANYONECANPAY: Only include the input being signed
    buffer.push(writeVarInt(1))
    const input = tx.vin[inputIndex]
    
    // Previous output hash (reversed for little-endian)
    const txidBytes = hexToBytes(input.txid)
    const reversedTxid = new Uint8Array(txidBytes.length)
    for (let i = 0; i < txidBytes.length; i++) {
      reversedTxid[i] = txidBytes[txidBytes.length - 1 - i]
    }
    buffer.push(reversedTxid)
    
    // Previous output index
    buffer.push(serializeBitcoinInt(input.vout))
    
    // Script for this input
    const scriptBytes = hexToBytes(scriptPubKey)
    buffer.push(writeVarInt(scriptBytes.length))
    buffer.push(scriptBytes)
    
    // Sequence
    buffer.push(serializeBitcoinInt(input.sequence ?? 0xffffffff))
  } else {
    // Include all inputs
    buffer.push(writeVarInt(tx.vin.length))
    
    for (let i = 0; i < tx.vin.length; i++) {
      const input = tx.vin[i]
      
      // Previous output hash (reversed for little-endian)
      const txidBytes = hexToBytes(input.txid)
      const reversedTxid = new Uint8Array(txidBytes.length)
      for (let j = 0; j < txidBytes.length; j++) {
        reversedTxid[j] = txidBytes[txidBytes.length - 1 - j]
      }
      buffer.push(reversedTxid)
      
      // Previous output index
      buffer.push(serializeBitcoinInt(input.vout))
      
      // Script: only include for the input being signed
      if (i === inputIndex) {
        const scriptBytes = hexToBytes(scriptPubKey)
        buffer.push(writeVarInt(scriptBytes.length))
        buffer.push(scriptBytes)
      } else {
        buffer.push(new Uint8Array([0]))  // Empty script
      }
      
      // Sequence: For SIGHASH_NONE and SIGHASH_SINGLE, set non-signing inputs to 0
      if ((baseHashType === SIGHASH_NONE || baseHashType === SIGHASH_SINGLE) && i !== inputIndex) {
        buffer.push(serializeBitcoinInt(0))
      } else {
        buffer.push(serializeBitcoinInt(input.sequence ?? 0xffffffff))
      }
    }
  }
  
  // Outputs
  if (baseHashType === SIGHASH_NONE) {
    // SIGHASH_NONE: No outputs
    buffer.push(writeVarInt(0))
  } else if (baseHashType === SIGHASH_SINGLE) {
    // SIGHASH_SINGLE: Only the output at the same index
    if (inputIndex >= (tx.vout?.length || 0)) {
      // Bug-for-bug compatibility: return specific hash if no matching output
      return '0x0000000000000000000000000000000000000000000000000000000000000001'
    }
    
    buffer.push(writeVarInt(inputIndex + 1))
    
    // Add empty outputs up to inputIndex
    for (let i = 0; i < inputIndex; i++) {
      // -1 value (0xffffffffffffffff) and empty script
      buffer.push(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]))
      buffer.push(new Uint8Array([0]))
    }
    
    // Add the actual output
    const output = tx.vout![inputIndex]
    buffer.push(serializeBitcoinInt64(output.value || 0))
    const scriptBytes = hexToBytes(output.scriptPubKey || '')
    buffer.push(writeVarInt(scriptBytes.length))
    buffer.push(scriptBytes)
  } else {
    // SIGHASH_ALL: All outputs
    const vout = tx.vout || []
    buffer.push(writeVarInt(vout.length))
    
    for (const output of vout) {
      buffer.push(serializeBitcoinInt64(output.value || 0))
      const scriptBytes = hexToBytes(output.scriptPubKey || '')
      buffer.push(writeVarInt(scriptBytes.length))
      buffer.push(scriptBytes)
    }
  }
  
  // Locktime (4 bytes, little-endian)
  buffer.push(serializeBitcoinInt(tx.locktime || 0))
  
  // Hash type (4 bytes, little-endian)
  buffer.push(serializeBitcoinInt(hashType))
  
  // Concatenate all buffers
  const totalLength = buffer.reduce((sum, b) => sum + b.length, 0)
  const serialized = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of buffer) {
    serialized.set(chunk, offset)
    offset += chunk.length
  }
  
  // Double SHA256
  const hash = await doubleSha256(serialized)
  return bytesToHex(hash)
}

/**
 * Calculate BIP-143 SegWit sighash
 * This is used for P2WPKH, P2WSH, and wrapped SegWit inputs
 */
export async function calculateSegwitSighash(
  tx: RawTransaction,
  inputIndex: number,
  scriptCode: string,
  value: number | bigint,
  hashType: number = SIGHASH_ALL
): Promise<string> {
  const baseHashType = getBaseHashType(hashType)
  const anyoneCanPay = isAnyoneCanPay(hashType)
  
  if (!tx.vin || tx.vin.length === 0) {
    throw new Error('Transaction must have inputs')
  }
  
  // 1. hashPrevouts
  let hashPrevouts: Uint8Array
  if (!anyoneCanPay) {
    const prevouts: Uint8Array[] = []
    for (const input of tx.vin) {
      const txidBytes = hexToBytes(input.txid)
      const reversedTxid = new Uint8Array(txidBytes.length)
      for (let i = 0; i < txidBytes.length; i++) {
        reversedTxid[i] = txidBytes[txidBytes.length - 1 - i]
      }
      prevouts.push(reversedTxid)
      prevouts.push(serializeBitcoinInt(input.vout))
    }
    const prevoutsConcat = concatArrays(prevouts)
    hashPrevouts = await doubleSha256(prevoutsConcat)
  } else {
    hashPrevouts = new Uint8Array(32)  // Zero hash
  }
  
  // 2. hashSequence
  let hashSequence: Uint8Array
  if (!anyoneCanPay && baseHashType !== SIGHASH_SINGLE && baseHashType !== SIGHASH_NONE) {
    const sequences: Uint8Array[] = []
    for (const input of tx.vin) {
      sequences.push(serializeBitcoinInt(input.sequence ?? 0xffffffff))
    }
    const sequencesConcat = concatArrays(sequences)
    hashSequence = await doubleSha256(sequencesConcat)
  } else {
    hashSequence = new Uint8Array(32)  // Zero hash
  }
  
  // 3. hashOutputs
  let hashOutputs: Uint8Array
  if (baseHashType !== SIGHASH_SINGLE && baseHashType !== SIGHASH_NONE) {
    const outputs: Uint8Array[] = []
    for (const output of tx.vout || []) {
      outputs.push(serializeBitcoinInt64(output.value || 0))
      const scriptBytes = hexToBytes(output.scriptPubKey || '')
      outputs.push(writeVarInt(scriptBytes.length))
      outputs.push(scriptBytes)
    }
    const outputsConcat = concatArrays(outputs)
    hashOutputs = await doubleSha256(outputsConcat)
  } else if (baseHashType === SIGHASH_SINGLE && inputIndex < (tx.vout?.length || 0)) {
    const output = tx.vout![inputIndex]
    const outputBuffer = concatArrays([
      serializeBitcoinInt64(output.value || 0),
      writeVarInt(hexToBytes(output.scriptPubKey || '').length),
      hexToBytes(output.scriptPubKey || '')
    ])
    hashOutputs = await doubleSha256(outputBuffer)
  } else {
    hashOutputs = new Uint8Array(32)  // Zero hash
  }
  
  // Build the preimage
  const input = tx.vin[inputIndex]
  const txidBytes = hexToBytes(input.txid)
  const reversedTxid = new Uint8Array(txidBytes.length)
  for (let i = 0; i < txidBytes.length; i++) {
    reversedTxid[i] = txidBytes[txidBytes.length - 1 - i]
  }
  
  const scriptCodeBytes = hexToBytes(scriptCode)
  
  const preimage = concatArrays([
    serializeBitcoinInt(tx.version || 1),           // nVersion
    hashPrevouts,                                     // hashPrevouts
    hashSequence,                                     // hashSequence
    reversedTxid,                                     // outpoint txid
    serializeBitcoinInt(input.vout),                 // outpoint index
    writeVarInt(scriptCodeBytes.length),             // scriptCode length
    scriptCodeBytes,                                  // scriptCode
    serializeBitcoinInt64(value),                    // value
    serializeBitcoinInt(input.sequence ?? 0xffffffff), // nSequence
    hashOutputs,                                      // hashOutputs
    serializeBitcoinInt(tx.locktime || 0),           // nLocktime
    serializeBitcoinInt(hashType),                   // sighash type
  ])
  
  const hash = await doubleSha256(preimage)
  return bytesToHex(hash)
}

/**
 * Helper to concatenate multiple Uint8Arrays
 */
function concatArrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

/**
 * Get human-readable sighash type name
 */
export function getSighashTypeName(hashType: number): string {
  const base = getBaseHashType(hashType)
  const anyoneCanPay = isAnyoneCanPay(hashType)
  
  let name: string
  switch (base) {
    case SIGHASH_ALL:
      name = 'SIGHASH_ALL'
      break
    case SIGHASH_NONE:
      name = 'SIGHASH_NONE'
      break
    case SIGHASH_SINGLE:
      name = 'SIGHASH_SINGLE'
      break
    default:
      name = `UNKNOWN(${base})`
  }
  
  if (anyoneCanPay) {
    name += '|ANYONECANPAY'
  }
  
  return name
}

// ============================================================================
// Transaction Extraction and Decoding
// ============================================================================

/**
 * Safely parse a decoded Uint8Array to an integer
 * Returns defaultValue (0) if the array is empty or invalid
 */
function safeParseDecodedInt(decoded: any, defaultValue: number = 0): number {
  if (!decoded) return defaultValue
  const bytes = decoded as Uint8Array
  if (bytes.length === 0) return defaultValue
  const hex = bytesToHex(bytes)
  if (hex === '0x' || hex === '0x0' || hex === '0x00') return defaultValue
  const parsed = parseInt(hex, 16)
  return isNaN(parsed) ? defaultValue : parsed
}

export async function extractSighashFromRawTx(rawTxHex: string): Promise<TransactionWithSighash> {
  const txBytes = hexToBytes(rawTxHex)
  
  // Check for typed transactions (EIP-2718)
  // Type 1: 0x01 prefix (EIP-2930)
  // Type 2: 0x02 prefix (EIP-1559)
  if (txBytes.length > 0 && (txBytes[0] === 0x01 || txBytes[0] === 0x02)) {
    try {
      const txType = txBytes[0]
      const decoded = decodeTypedEthereumTransaction(rawTxHex)
      decoded.type = txType
      const sighash = await calculateEthereumSighash(decoded)
      
      const sigTypeName = txType === 2 ? 'EIP-1559' : 'EIP-2930'
      
      return {
        rawTx: rawTxHex,
        sighash,
        txType: 'ethereum',
        r: decoded.r,
        s: decoded.s,
        v: decoded.v,
        sigType: sigTypeName
      }
    } catch (error) {
      console.error('Error decoding typed Ethereum transaction:', error)
      throw error
    }
  }
  
  // Check for legacy Ethereum (RLP-encoded, starts with 0xc0-0xff)
  const isEthereum = txBytes.length > 0 && (
    (txBytes[0] >= 0xc0) ||
    (rawTxHex.includes('gasPrice') || rawTxHex.includes('nonce'))
  )
  
  if (isEthereum) {
    try {
      const decoded = decodeRLPTransaction(rawTxHex)
      const sighash = await calculateEthereumSighash(decoded)
      
      // Determine sig type from v value
      let sigType = 'legacy'
      if (decoded.v && decoded.v > 28) {
        // EIP-155: v = chainId * 2 + 35 or chainId * 2 + 36
        const recoveryBit = decoded.v % 2
        const chainId = (decoded.v - 35 - recoveryBit) / 2
        if (chainId > 0) {
          decoded.chainId = chainId
          sigType = 'EIP-155'
        }
      }
      
      return {
        rawTx: rawTxHex,
        sighash,
        txType: 'ethereum',
        r: decoded.r,
        s: decoded.s,
        v: decoded.v,
        sigType
      }
    } catch (error) {
      console.error('Error decoding Ethereum transaction:', error)
      throw error
    }
  } else {
    try {
      const decoded = decodeBitcoinTransaction(rawTxHex)
      
      // Detect if this is a SegWit transaction
      const isSegwit = txBytes[4] === 0x00 && txBytes[5] === 0x01
      
      // For now, use legacy sighash (would need scriptPubKey for proper calculation)
      const sighash = await calculateBitcoinSighash(decoded, 0, '', SIGHASH_ALL)
      
      return {
        rawTx: rawTxHex,
        sighash,
        txType: 'bitcoin',
        sigType: isSegwit ? 'SegWit (BIP-143)' : 'Legacy'
      }
    } catch (error) {
      console.error('Error decoding Bitcoin transaction:', error)
      throw error
    }
  }
}

/**
 * Decode EIP-2930 (Type 1) or EIP-1559 (Type 2) transaction
 */
function decodeTypedEthereumTransaction(rawTx: string): any {
  const bytes = hexToBytes(rawTx)
  const txType = bytes[0]
  
  // Skip the type byte for decoding
  const payloadBytes = bytes.slice(1)
  const decoded = rlpDecode(payloadBytes)
  
  if (!Array.isArray(decoded)) {
    throw new Error('Invalid typed transaction')
  }
  
  if (txType === 0x02) {
    // EIP-1559 (Type 2)
    if (decoded.length < 12) {
      throw new Error('Invalid EIP-1559 transaction')
    }
    
    return {
      type: 2,
      chainId: safeParseDecodedInt(decoded[0], 1),
      nonce: safeParseDecodedInt(decoded[1]),
      maxPriorityFeePerGas: bytesToHex(decoded[2] as Uint8Array),
      maxFeePerGas: bytesToHex(decoded[3] as Uint8Array),
      gasLimit: bytesToHex(decoded[4] as Uint8Array),
      to: bytesToHex(decoded[5] as Uint8Array),
      value: bytesToHex(decoded[6] as Uint8Array),
      data: bytesToHex(decoded[7] as Uint8Array),
      accessList: decoded[8] || [],
      v: safeParseDecodedInt(decoded[9]),
      r: bytesToHex(decoded[10] as Uint8Array),
      s: bytesToHex(decoded[11] as Uint8Array),
    }
  } else if (txType === 0x01) {
    // EIP-2930 (Type 1)
    if (decoded.length < 11) {
      throw new Error('Invalid EIP-2930 transaction')
    }
    
    return {
      type: 1,
      chainId: safeParseDecodedInt(decoded[0], 1),
      nonce: safeParseDecodedInt(decoded[1]),
      gasPrice: bytesToHex(decoded[2] as Uint8Array),
      gasLimit: bytesToHex(decoded[3] as Uint8Array),
      to: bytesToHex(decoded[4] as Uint8Array),
      value: bytesToHex(decoded[5] as Uint8Array),
      data: bytesToHex(decoded[6] as Uint8Array),
      accessList: decoded[7] || [],
      v: safeParseDecodedInt(decoded[8]),
      r: bytesToHex(decoded[9] as Uint8Array),
      s: bytesToHex(decoded[10] as Uint8Array),
    }
  }
  
  throw new Error(`Unknown transaction type: ${txType}`)
}

function decodeRLPTransaction(rawTx: string): any {
  const bytes = hexToBytes(rawTx)
  const decoded = rlpDecode(bytes)
  
  if (!Array.isArray(decoded) || decoded.length < 9) {
    throw new Error('Invalid RLP encoded transaction')
  }
  
  return {
    nonce: safeParseDecodedInt(decoded[0]),
    gasPrice: bytesToHex(decoded[1] as Uint8Array),
    gasLimit: bytesToHex(decoded[2] as Uint8Array),
    to: bytesToHex(decoded[3] as Uint8Array),
    value: bytesToHex(decoded[4] as Uint8Array),
    data: bytesToHex(decoded[5] as Uint8Array),
    v: safeParseDecodedInt(decoded[6]),
    r: bytesToHex(decoded[7] as Uint8Array),
    s: bytesToHex(decoded[8] as Uint8Array),
    chainId: decoded.length > 9 && decoded[9] ? safeParseDecodedInt(decoded[9]) : undefined
  }
}

function rlpDecode(bytes: Uint8Array): any {
  if (bytes.length === 0) return new Uint8Array(0)
  
  const prefix = bytes[0]
  
  if (prefix < 128) {
    return bytes.slice(0, 1)
  }
  
  if (prefix <= 183) {
    const length = prefix - 128
    return bytes.slice(1, 1 + length)
  }
  
  if (prefix <= 191) {
    const lengthOfLength = prefix - 183
    const length = parseInt(bytesToHex(bytes.slice(1, 1 + lengthOfLength)), 16)
    return bytes.slice(1 + lengthOfLength, 1 + lengthOfLength + length)
  }
  
  if (prefix <= 247) {
    const length = prefix - 192
    const data = bytes.slice(1, 1 + length)
    return decodeRLPList(data)
  }
  
  const lengthOfLength = prefix - 247
  const length = parseInt(bytesToHex(bytes.slice(1, 1 + lengthOfLength)), 16)
  const data = bytes.slice(1 + lengthOfLength, 1 + lengthOfLength + length)
  return decodeRLPList(data)
}

function decodeRLPList(bytes: Uint8Array): any[] {
  const result: any[] = []
  let offset = 0
  
  while (offset < bytes.length) {
    const item = rlpDecode(bytes.slice(offset))
    result.push(item)
    
    const prefix = bytes[offset]
    if (prefix < 128) {
      offset += 1
    } else if (prefix <= 183) {
      offset += 1 + (prefix - 128)
    } else if (prefix <= 191) {
      const lengthOfLength = prefix - 183
      const length = parseInt(bytesToHex(bytes.slice(offset + 1, offset + 1 + lengthOfLength)), 16)
      offset += 1 + lengthOfLength + length
    } else if (prefix <= 247) {
      offset += 1 + (prefix - 192)
    } else {
      const lengthOfLength = prefix - 247
      const length = parseInt(bytesToHex(bytes.slice(offset + 1, offset + 1 + lengthOfLength)), 16)
      offset += 1 + lengthOfLength + length
    }
  }
  
  return result
}

function decodeBitcoinTransaction(rawTx: string): RawTransaction {
  const bytes = hexToBytes(rawTx)
  let offset = 0
  
  const version = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
  offset += 4
  
  const [vinCount, vinCountSize] = readVarInt(bytes.slice(offset))
  offset += vinCountSize
  
  const vin: Array<{ txid: string; vout: number; scriptSig?: string; sequence?: number }> = []
  
  for (let i = 0; i < vinCount; i++) {
    const txid = bytesToHex(bytes.slice(offset, offset + 32).reverse())
    offset += 32
    
    const vout = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
    offset += 4
    
    const [scriptLen, scriptLenSize] = readVarInt(bytes.slice(offset))
    offset += scriptLenSize
    
    const scriptSig = bytesToHex(bytes.slice(offset, offset + scriptLen))
    offset += scriptLen
    
    const sequence = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
    offset += 4
    
    vin.push({ txid, vout, scriptSig, sequence })
  }
  
  const [voutCount, voutCountSize] = readVarInt(bytes.slice(offset))
  offset += voutCountSize
  
  const vout: Array<{ value: number; scriptPubKey?: string }> = []
  
  for (let i = 0; i < voutCount; i++) {
    let value = 0
    for (let j = 0; j < 8; j++) {
      value += bytes[offset + j] << (j * 8)
    }
    offset += 8
    
    const [scriptLen, scriptLenSize] = readVarInt(bytes.slice(offset))
    offset += scriptLenSize
    
    const scriptPubKey = bytesToHex(bytes.slice(offset, offset + scriptLen))
    offset += scriptLen
    
    vout.push({ value, scriptPubKey })
  }
  
  const locktime = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
  
  return { version, vin, vout, locktime }
}

function readVarInt(bytes: Uint8Array): [number, number] {
  const first = bytes[0]
  
  if (first < 0xfd) {
    return [first, 1]
  } else if (first === 0xfd) {
    return [bytes[1] | (bytes[2] << 8), 3]
  } else if (first === 0xfe) {
    return [bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24), 5]
  } else {
    return [bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24), 9]
  }
}

export async function calculateSighashFromComponents(
  nonce: number | string,
  gasPrice: string,
  gasLimit: string,
  to: string,
  value: string,
  data: string,
  chainId?: number
): Promise<string> {
  const tx: RawTransaction = {
    nonce: typeof nonce === 'string' ? parseInt(nonce) : nonce,
    gasPrice,
    gasLimit,
    to,
    value,
    data,
    chainId
  }
  
  return await calculateEthereumSighash(tx)
}

export function validateSighash(sighash: string, r: string, s: string): boolean {
  try {
    const zBigInt = BigInt(sighash)
    const rBigInt = BigInt(r)
    const sBigInt = BigInt(s)
    
    const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
    
    if (zBigInt <= 0n || zBigInt >= SECP256K1_N) {
      return false
    }
    
    if (rBigInt <= 0n || rBigInt >= SECP256K1_N) {
      return false
    }
    
    if (sBigInt <= 0n || sBigInt >= SECP256K1_N) {
      return false
    }
    
    return true
  } catch {
    return false
  }
}
