/**
 * Blockchair TSV Data Parser
 * 
 * This module handles parsing of Blockchair Bitcoin TSV dump files to extract
 * ECDSA signature components (R, S) and calculate message hashes (Z) for
 * cryptographic analysis and vulnerability detection.
 */

import { ParsedSignature } from './dataParser'

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Parsed Bitcoin input from Blockchair inputs TSV file
 */
export interface BlockchairInput {
  blockId: number
  transactionHash: string
  index: number
  time: string
  value: bigint
  valueUsd?: number
  recipient?: string
  type?: string
  scriptHex: string
  scriptPubKeyHex?: string
  spendingSignatureHex?: string
  spendingWitnessHex?: string
  spendingSequence?: number
  spendingNLocktime?: number
  isSpent?: boolean
  spendingTransactionHash?: string
  spendingBlockId?: number
  spendingIndex?: number
  // Extracted signature components
  r?: string
  s?: string
  publicKey?: string
  sighashType?: number
}

/**
 * Parsed Bitcoin output from Blockchair outputs TSV file
 */
export interface BlockchairOutput {
  blockId: number
  transactionHash: string
  index: number
  time: string
  value: bigint
  valueUsd?: number
  recipient?: string
  type?: string
  scriptPubKeyHex: string
  isSpent: boolean
  spendingTransactionHash?: string
  spendingBlockId?: number
  spendingIndex?: number
}

/**
 * Parsed Bitcoin transaction from Blockchair transactions TSV file
 */
export interface BlockchairTransaction {
  blockId: number
  hash: string
  time: string
  size: number
  weight: number
  version: number
  lockTime: number
  isCoinbase: boolean
  hasWitness: boolean
  inputCount: number
  outputCount: number
  inputTotal: bigint
  outputTotal: bigint
  fee: bigint
  feeUsd?: number
}

/**
 * Complete signature data extracted from Blockchair dumps
 */
export interface ExtractedSignature {
  r: bigint
  s: bigint
  z: bigint
  publicKey?: string
  address?: string
  transactionHash: string
  inputIndex: number
  blockId: number
  timestamp: number
  value: bigint
  sighashType: number
  signatureType: 'legacy' | 'segwit'
  // Vulnerability flags
  vulnerabilities: VulnerabilityFlag[]
}

/**
 * Vulnerability detection flags
 */
export interface VulnerabilityFlag {
  type: 'nonce_reuse' | 'biased_nonce' | 'small_r' | 'related_nonce' | 'msb_bias' | 'lsb_bias'
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  metadata?: Record<string, any>
}

/**
 * Result of parsing Blockchair TSV files
 */
export interface BlockchairParseResult {
  signatures: ExtractedSignature[]
  totalInputs: number
  totalTransactions: number
  successfulExtractions: number
  failedExtractions: number
  vulnerabilities: {
    nonceReuse: number
    biasedNonce: number
    smallR: number
    relatedNonce: number
  }
  parseErrors: string[]
}

// ============================================================================
// Constants
// ============================================================================

const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
const SECP256K1_HALF_N = SECP256K1_N / 2n

// ============================================================================
// DER Signature Parsing
// ============================================================================

/**
 * Parse a DER-encoded ECDSA signature to extract R and S values.
 * 
 * DER Format:
 * - 0x30 (sequence marker)
 * - Total length
 * - 0x02 (integer marker for R)
 * - R length
 * - R value (may have leading 0x00 for positive numbers)
 * - 0x02 (integer marker for S)
 * - S length
 * - S value (may have leading 0x00 for positive numbers)
 * - Sighash type (last byte, usually 0x01 for SIGHASH_ALL)
 */
export function parseDERSignature(hexSignature: string): { 
  r: bigint
  s: bigint
  sighashType: number 
} | null {
  try {
    let hex = hexSignature
    if (hex.startsWith('0x')) {
      hex = hex.slice(2)
    }
    
    // Minimum valid DER signature length
    if (hex.length < 16) {
      return null
    }
    
    let pos = 0
    
    // Check for sequence marker 0x30
    if (hex.substring(pos, pos + 2) !== '30') {
      return null
    }
    pos += 2
    
    // Get total length (can be 1 or 2 bytes for long form)
    let totalLength = parseInt(hex.substring(pos, pos + 2), 16)
    pos += 2
    
    // Check for R integer marker 0x02
    if (hex.substring(pos, pos + 2) !== '02') {
      return null
    }
    pos += 2
    
    // Get R length
    const rLen = parseInt(hex.substring(pos, pos + 2), 16)
    pos += 2
    
    // Extract R value
    let rHex = hex.substring(pos, pos + rLen * 2)
    pos += rLen * 2
    
    // Check for S integer marker 0x02
    if (hex.substring(pos, pos + 2) !== '02') {
      return null
    }
    pos += 2
    
    // Get S length
    const sLen = parseInt(hex.substring(pos, pos + 2), 16)
    pos += 2
    
    // Extract S value
    let sHex = hex.substring(pos, pos + sLen * 2)
    pos += sLen * 2
    
    // Extract sighash type (last byte of the signature)
    let sighashType = 1 // Default to SIGHASH_ALL
    if (pos < hex.length) {
      sighashType = parseInt(hex.substring(pos, pos + 2), 16)
    }
    
    // Remove leading zeros from R and S (DER uses minimal encoding)
    if (rHex.startsWith('00') && rHex.length > 2) {
      rHex = rHex.substring(2)
    }
    if (sHex.startsWith('00') && sHex.length > 2) {
      sHex = sHex.substring(2)
    }
    
    // Convert to BigInt
    const r = BigInt('0x' + (rHex || '0'))
    const s = BigInt('0x' + (sHex || '0'))
    
    // Validate R and S are within secp256k1 range
    if (r <= 0n || r >= SECP256K1_N || s <= 0n || s >= SECP256K1_N) {
      return null
    }
    
    return { r, s, sighashType }
  } catch (error) {
    return null
  }
}

/**
 * Extract signature and public key from a Legacy scriptSig.
 * Format: PUSH <signature> PUSH <pubkey>
 */
export function parseLegacyScriptSig(scriptHex: string): {
  signature: { r: bigint; s: bigint; sighashType: number } | null
  publicKey: string | null
} {
  try {
    let hex = scriptHex.startsWith('0x') ? scriptHex.slice(2) : scriptHex
    
    let pos = 0
    const result: {
      signature: { r: bigint; s: bigint; sighashType: number } | null
      publicKey: string | null
    } = { signature: null, publicKey: null }
    
    // Parse first PUSH (signature)
    const sigPushLen = parseInt(hex.substring(pos, pos + 2), 16)
    pos += 2
    
    if (sigPushLen >= 0x47 && sigPushLen <= 0x49) {
      // Typical signature length (71-73 bytes)
      const sigHex = hex.substring(pos, pos + sigPushLen * 2)
      pos += sigPushLen * 2
      result.signature = parseDERSignature(sigHex)
    } else if (sigPushLen > 0 && sigPushLen < 0x4c) {
      // Direct push
      const sigHex = hex.substring(pos, pos + sigPushLen * 2)
      pos += sigPushLen * 2
      result.signature = parseDERSignature(sigHex)
    }
    
    // Parse second PUSH (public key) if present
    if (pos < hex.length - 2) {
      const pubPushLen = parseInt(hex.substring(pos, pos + 2), 16)
      pos += 2
      
      if (pubPushLen === 0x21 || pubPushLen === 0x41) {
        // Compressed (33 bytes) or uncompressed (65 bytes) public key
        result.publicKey = hex.substring(pos, pos + pubPushLen * 2)
      }
    }
    
    return result
  } catch {
    return { signature: null, publicKey: null }
  }
}

/**
 * Extract signature and public key from a SegWit witness stack.
 * Format for P2WPKH: <signature> <pubkey>
 */
export function parseWitnessStack(witnessHex: string): {
  signature: { r: bigint; s: bigint; sighashType: number } | null
  publicKey: string | null
} {
  try {
    let hex = witnessHex.startsWith('0x') ? witnessHex.slice(2) : witnessHex
    
    const result: {
      signature: { r: bigint; s: bigint; sighashType: number } | null
      publicKey: string | null
    } = { signature: null, publicKey: null }
    
    // For P2WPKH, witness is: <num_items> <sig_len> <signature> <pubkey_len> <pubkey>
    let pos = 0
    
    // Number of witness items
    const numItems = parseInt(hex.substring(pos, pos + 2), 16)
    pos += 2
    
    if (numItems < 2) {
      // Try parsing as raw signature + pubkey
      return parseRawWitness(hex)
    }
    
    // First item: signature
    const sigLen = parseInt(hex.substring(pos, pos + 2), 16)
    pos += 2
    
    if (sigLen >= 70 && sigLen <= 73) {
      const sigHex = hex.substring(pos, pos + sigLen * 2)
      pos += sigLen * 2
      result.signature = parseDERSignature(sigHex)
    }
    
    // Second item: public key
    if (pos < hex.length - 2) {
      const pubLen = parseInt(hex.substring(pos, pos + 2), 16)
      pos += 2
      
      if (pubLen === 33 || pubLen === 65) {
        result.publicKey = hex.substring(pos, pos + pubLen * 2)
      }
    }
    
    return result
  } catch {
    return { signature: null, publicKey: null }
  }
}

/**
 * Parse raw witness data without item count prefix
 */
function parseRawWitness(hex: string): {
  signature: { r: bigint; s: bigint; sighashType: number } | null
  publicKey: string | null
} {
  const result: {
    signature: { r: bigint; s: bigint; sighashType: number } | null
    publicKey: string | null
  } = { signature: null, publicKey: null }
  
  // Look for DER signature pattern (starts with 0x30)
  for (let i = 0; i < Math.min(hex.length - 140, 20); i += 2) {
    if (hex.substring(i, i + 2) === '30') {
      const lenByte = parseInt(hex.substring(i + 2, i + 4), 16)
      if (lenByte >= 68 && lenByte <= 72) {
        const sigHex = hex.substring(i, i + 4 + lenByte * 2)
        result.signature = parseDERSignature(sigHex)
        if (result.signature) {
          // Look for public key after signature
          const afterSig = i + 4 + lenByte * 2 + 2 // +2 for sighash type
          if (afterSig + 66 <= hex.length) {
            const pubKeyCandidate = hex.substring(afterSig, afterSig + 66)
            if (pubKeyCandidate.startsWith('02') || pubKeyCandidate.startsWith('03')) {
              result.publicKey = pubKeyCandidate
            }
          }
          break
        }
      }
    }
  }
  
  return result
}

// ============================================================================
// TSV Parsing
// ============================================================================

/**
 * Parse Blockchair inputs TSV content
 */
export function parseInputsTSV(content: string): BlockchairInput[] {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []
  
  const headers = lines[0].split('\t').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'))
  const inputs: BlockchairInput[] = []
  
  // Map common column names
  const columnMap: Record<string, number> = {}
  const knownColumns = [
    'block_id', 'transaction_hash', 'index', 'time', 'value', 'value_usd',
    'recipient', 'type', 'script_hex', 'spending_signature_hex', 'spending_witness_hex',
    'spending_sequence', 'is_spent', 'spending_transaction_hash', 'spending_block_id',
    'spending_index', 'spending_n_locktime'
  ]
  
  headers.forEach((h, idx) => {
    for (const known of knownColumns) {
      if (h.includes(known.replace(/_/g, '')) || h === known) {
        columnMap[known] = idx
        break
      }
    }
  })
  
  for (let i = 1; i < lines.length; i++) {
    try {
      const cols = lines[i].split('\t')
      
      const input: BlockchairInput = {
        blockId: parseInt(cols[columnMap['block_id']] || '0') || 0,
        transactionHash: cols[columnMap['transaction_hash']] || '',
        index: parseInt(cols[columnMap['index']] || '0') || 0,
        time: cols[columnMap['time']] || '',
        value: BigInt(cols[columnMap['value']] || '0'),
        scriptHex: cols[columnMap['script_hex']] || '',
        spendingSignatureHex: cols[columnMap['spending_signature_hex']] || '',
        spendingWitnessHex: cols[columnMap['spending_witness_hex']] || '',
        spendingSequence: parseInt(cols[columnMap['spending_sequence']] || '0') || 0,
        spendingNLocktime: parseInt(cols[columnMap['spending_n_locktime']] || '0') || 0,
        isSpent: cols[columnMap['is_spent']] === 'true' || cols[columnMap['is_spent']] === '1',
        spendingTransactionHash: cols[columnMap['spending_transaction_hash']] || undefined,
        spendingBlockId: parseInt(cols[columnMap['spending_block_id']] || '0') || undefined,
        spendingIndex: parseInt(cols[columnMap['spending_index']] || '0') || undefined,
      }
      
      if (cols[columnMap['value_usd']]) {
        input.valueUsd = parseFloat(cols[columnMap['value_usd']])
      }
      if (cols[columnMap['recipient']]) {
        input.recipient = cols[columnMap['recipient']]
      }
      if (cols[columnMap['type']]) {
        input.type = cols[columnMap['type']]
      }
      
      inputs.push(input)
    } catch (error) {
      // Skip malformed lines
      continue
    }
  }
  
  return inputs
}

/**
 * Parse Blockchair outputs TSV content
 */
export function parseOutputsTSV(content: string): BlockchairOutput[] {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []
  
  const headers = lines[0].split('\t').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'))
  const outputs: BlockchairOutput[] = []
  
  const columnMap: Record<string, number> = {}
  const knownColumns = [
    'block_id', 'transaction_hash', 'index', 'time', 'value', 'value_usd',
    'recipient', 'type', 'script_pub_key_hex', 'is_spent', 'spending_transaction_hash',
    'spending_block_id', 'spending_index'
  ]
  
  headers.forEach((h, idx) => {
    for (const known of knownColumns) {
      if (h.includes(known.replace(/_/g, '')) || h === known) {
        columnMap[known] = idx
        break
      }
    }
  })
  
  for (let i = 1; i < lines.length; i++) {
    try {
      const cols = lines[i].split('\t')
      
      outputs.push({
        blockId: parseInt(cols[columnMap['block_id']] || '0') || 0,
        transactionHash: cols[columnMap['transaction_hash']] || '',
        index: parseInt(cols[columnMap['index']] || '0') || 0,
        time: cols[columnMap['time']] || '',
        value: BigInt(cols[columnMap['value']] || '0'),
        valueUsd: parseFloat(cols[columnMap['value_usd']] || '0'),
        recipient: cols[columnMap['recipient']] || '',
        type: cols[columnMap['type']] || '',
        scriptPubKeyHex: cols[columnMap['script_pub_key_hex']] || '',
        isSpent: cols[columnMap['is_spent']] === 'true' || cols[columnMap['is_spent']] === '1',
        spendingTransactionHash: cols[columnMap['spending_transaction_hash']] || undefined,
        spendingBlockId: parseInt(cols[columnMap['spending_block_id']] || '0') || undefined,
        spendingIndex: parseInt(cols[columnMap['spending_index']] || '0') || undefined,
      })
    } catch {
      continue
    }
  }
  
  return outputs
}

/**
 * Parse Blockchair transactions TSV content
 */
export function parseTransactionsTSV(content: string): BlockchairTransaction[] {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []
  
  const headers = lines[0].split('\t').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'))
  const transactions: BlockchairTransaction[] = []
  
  const columnMap: Record<string, number> = {}
  const knownColumns = [
    'block_id', 'hash', 'time', 'size', 'weight', 'version', 'lock_time',
    'is_coinbase', 'has_witness', 'input_count', 'output_count',
    'input_total', 'output_total', 'fee', 'fee_usd'
  ]
  
  headers.forEach((h, idx) => {
    for (const known of knownColumns) {
      if (h.includes(known.replace(/_/g, '')) || h === known) {
        columnMap[known] = idx
        break
      }
    }
  })
  
  for (let i = 1; i < lines.length; i++) {
    try {
      const cols = lines[i].split('\t')
      
      transactions.push({
        blockId: parseInt(cols[columnMap['block_id']] || '0') || 0,
        hash: cols[columnMap['hash']] || '',
        time: cols[columnMap['time']] || '',
        size: parseInt(cols[columnMap['size']] || '0') || 0,
        weight: parseInt(cols[columnMap['weight']] || '0') || 0,
        version: parseInt(cols[columnMap['version']] || '1') || 1,
        lockTime: parseInt(cols[columnMap['lock_time']] || '0') || 0,
        isCoinbase: cols[columnMap['is_coinbase']] === 'true' || cols[columnMap['is_coinbase']] === '1',
        hasWitness: cols[columnMap['has_witness']] === 'true' || cols[columnMap['has_witness']] === '1',
        inputCount: parseInt(cols[columnMap['input_count']] || '0') || 0,
        outputCount: parseInt(cols[columnMap['output_count']] || '0') || 0,
        inputTotal: BigInt(cols[columnMap['input_total']] || '0'),
        outputTotal: BigInt(cols[columnMap['output_total']] || '0'),
        fee: BigInt(cols[columnMap['fee']] || '0'),
        feeUsd: parseFloat(cols[columnMap['fee_usd']] || '0'),
      })
    } catch {
      continue
    }
  }
  
  return transactions
}

// ============================================================================
// Signature Extraction
// ============================================================================

/**
 * Extract signatures from Blockchair input data.
 * Handles both Legacy (scriptSig) and SegWit (witness) inputs.
 */
export function extractSignaturesFromInputs(
  inputs: BlockchairInput[],
  _outputsMap?: Map<string, BlockchairOutput>
): ExtractedSignature[] {
  const signatures: ExtractedSignature[] = []
  
  for (const input of inputs) {
    try {
      let sigData: { r: bigint; s: bigint; sighashType: number } | null = null
      let publicKey: string | null = null
      let signatureType: 'legacy' | 'segwit' = 'legacy'
      
      // Try SegWit witness first
      if (input.spendingWitnessHex && input.spendingWitnessHex.length > 10) {
        const witnessResult = parseWitnessStack(input.spendingWitnessHex)
        if (witnessResult.signature) {
          sigData = witnessResult.signature
          publicKey = witnessResult.publicKey
          signatureType = 'segwit'
        }
      }
      
      // Fall back to Legacy scriptSig
      if (!sigData && input.spendingSignatureHex && input.spendingSignatureHex.length > 10) {
        const legacyResult = parseLegacyScriptSig(input.spendingSignatureHex)
        if (legacyResult.signature) {
          sigData = legacyResult.signature
          publicKey = legacyResult.publicKey
          signatureType = 'legacy'
        }
      }
      
      // Try the main script_hex field if both above failed
      if (!sigData && input.scriptHex && input.scriptHex.length > 10) {
        const scriptResult = parseLegacyScriptSig(input.scriptHex)
        if (scriptResult.signature) {
          sigData = scriptResult.signature
          publicKey = scriptResult.publicKey
        }
      }
      
      if (!sigData) {
        continue
      }
      
      // For now, use transaction hash as Z (message hash placeholder)
      // In a full implementation, this would be calculated using the pre-image
      const zPlaceholder = input.transactionHash 
        ? BigInt('0x' + (input.transactionHash.startsWith('0x') 
            ? input.transactionHash.slice(2) 
            : input.transactionHash))
        : 0n
      
      // Parse timestamp
      let timestamp = 0
      if (input.time) {
        try {
          timestamp = new Date(input.time).getTime()
        } catch {
          timestamp = 0
        }
      }
      
      const extractedSig: ExtractedSignature = {
        r: sigData.r,
        s: sigData.s,
        z: zPlaceholder,
        publicKey: publicKey || undefined,
        address: input.recipient,
        transactionHash: input.transactionHash,
        inputIndex: input.index,
        blockId: input.blockId,
        timestamp,
        value: input.value,
        sighashType: sigData.sighashType,
        signatureType,
        vulnerabilities: []
      }
      
      signatures.push(extractedSig)
    } catch {
      // Skip problematic inputs
      continue
    }
  }
  
  return signatures
}

// ============================================================================
// Vulnerability Detection
// ============================================================================

/**
 * Detect nonce reuse (repeated R values with different messages)
 */
export function detectNonceReuse(signatures: ExtractedSignature[]): Map<string, ExtractedSignature[]> {
  const rValueMap = new Map<string, ExtractedSignature[]>()
  
  for (const sig of signatures) {
    const rKey = sig.r.toString()
    if (!rValueMap.has(rKey)) {
      rValueMap.set(rKey, [])
    }
    rValueMap.get(rKey)!.push(sig)
  }
  
  // Filter to only repeated R values
  const reusedNonces = new Map<string, ExtractedSignature[]>()
  for (const [rValue, sigs] of rValueMap.entries()) {
    if (sigs.length > 1) {
      // Mark all signatures in this group with the vulnerability
      for (const sig of sigs) {
        sig.vulnerabilities.push({
          type: 'nonce_reuse',
          severity: 'critical',
          description: `Nonce reuse detected! R-value ${rValue.slice(0, 20)}... reused ${sigs.length} times. Private key directly recoverable.`,
          metadata: { reuseCount: sigs.length }
        })
      }
      reusedNonces.set(rValue, sigs)
    }
  }
  
  return reusedNonces
}

/**
 * Detect biased nonces (small R values, leading zeros, bit patterns)
 */
export function detectBiasedNonces(signatures: ExtractedSignature[]): ExtractedSignature[] {
  const biasedSignatures: ExtractedSignature[] = []
  const expectedBits = 256
  
  for (const sig of signatures) {
    const rBits = sig.r.toString(2)
    const rBitLength = rBits.length
    const leadingZeros = expectedBits - rBitLength
    
    // Check for significantly short R values
    if (rBitLength < expectedBits * 0.9) {
      sig.vulnerabilities.push({
        type: 'biased_nonce',
        severity: 'high',
        description: `Biased nonce: R has ${rBitLength} bits (expected ~256). Suggests weak RNG.`,
        metadata: { bitLength: rBitLength, expectedBits }
      })
      biasedSignatures.push(sig)
    }
    
    // Check for excessive leading zeros
    if (leadingZeros > 10) {
      sig.vulnerabilities.push({
        type: 'msb_bias',
        severity: leadingZeros > 20 ? 'critical' : 'high',
        description: `MSB bias: R has ${leadingZeros} leading zero bits. HNP lattice attack possible.`,
        metadata: { leadingZeros }
      })
      if (!biasedSignatures.includes(sig)) {
        biasedSignatures.push(sig)
      }
    }
    
    // Check LSB bias (last few bits always 0 or 1)
    const last4Bits = sig.r & 0xFn
    if (last4Bits === 0n || last4Bits === 0xFn) {
      sig.vulnerabilities.push({
        type: 'lsb_bias',
        severity: 'medium',
        description: `LSB bias detected: Last 4 bits are ${last4Bits.toString(2).padStart(4, '0')}`,
        metadata: { lsb4: Number(last4Bits) }
      })
      if (!biasedSignatures.includes(sig)) {
        biasedSignatures.push(sig)
      }
    }
  }
  
  return biasedSignatures
}

/**
 * Detect small R values (extremely small, indicating critical weakness)
 */
export function detectSmallRValues(signatures: ExtractedSignature[]): ExtractedSignature[] {
  const threshold = SECP256K1_N / 10000n
  const smallRSignatures: ExtractedSignature[] = []
  
  for (const sig of signatures) {
    if (sig.r < threshold) {
      sig.vulnerabilities.push({
        type: 'small_r',
        severity: 'critical',
        description: `Extremely small R value: ${sig.r.toString().slice(0, 20)}. Critical implementation flaw.`,
        metadata: { rValue: sig.r.toString() }
      })
      smallRSignatures.push(sig)
    }
  }
  
  return smallRSignatures
}

/**
 * Detect related nonces (sequential or affine relationships)
 */
export function detectRelatedNonces(signatures: ExtractedSignature[]): ExtractedSignature[] {
  const sorted = [...signatures].sort((a, b) => {
    if (a.r < b.r) return -1
    if (a.r > b.r) return 1
    return 0
  })
  
  const relatedSignatures: ExtractedSignature[] = []
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = sorted[i + 1].r - sorted[i].r
    
    // Check for sequential nonces (diff = 1)
    if (diff === 1n) {
      sorted[i].vulnerabilities.push({
        type: 'related_nonce',
        severity: 'critical',
        description: 'Sequential nonce detected (R₂ = R₁ + 1). Trivially exploitable.',
        metadata: { relationship: 'sequential', diff: '1' }
      })
      sorted[i + 1].vulnerabilities.push({
        type: 'related_nonce',
        severity: 'critical',
        description: 'Sequential nonce detected (R₂ = R₁ + 1). Trivially exploitable.',
        metadata: { relationship: 'sequential', diff: '1' }
      })
      relatedSignatures.push(sorted[i], sorted[i + 1])
    }
    // Check for small linear relationships
    else if (diff > 0n && diff < 1000n) {
      sorted[i].vulnerabilities.push({
        type: 'related_nonce',
        severity: 'high',
        description: `Related nonces: difference is only ${diff}. May be exploitable.`,
        metadata: { relationship: 'linear', diff: diff.toString() }
      })
      if (!relatedSignatures.includes(sorted[i])) {
        relatedSignatures.push(sorted[i])
      }
    }
  }
  
  return relatedSignatures
}

/**
 * Run all vulnerability detection on a set of signatures
 */
export function analyzeSignaturesForVulnerabilities(
  signatures: ExtractedSignature[]
): {
  nonceReuse: Map<string, ExtractedSignature[]>
  biasedNonces: ExtractedSignature[]
  smallR: ExtractedSignature[]
  relatedNonces: ExtractedSignature[]
} {
  return {
    nonceReuse: detectNonceReuse(signatures),
    biasedNonces: detectBiasedNonces(signatures),
    smallR: detectSmallRValues(signatures),
    relatedNonces: detectRelatedNonces(signatures)
  }
}

// ============================================================================
// Main Parser Functions
// ============================================================================

/**
 * Parse a single Blockchair TSV file and extract signatures
 */
export function parseBlockchairTSV(
  content: string,
  fileType: 'inputs' | 'outputs' | 'transactions' = 'inputs'
): BlockchairParseResult {
  const result: BlockchairParseResult = {
    signatures: [],
    totalInputs: 0,
    totalTransactions: 0,
    successfulExtractions: 0,
    failedExtractions: 0,
    vulnerabilities: {
      nonceReuse: 0,
      biasedNonce: 0,
      smallR: 0,
      relatedNonce: 0
    },
    parseErrors: []
  }
  
  try {
    if (fileType === 'inputs') {
      const inputs = parseInputsTSV(content)
      result.totalInputs = inputs.length
      
      const signatures = extractSignaturesFromInputs(inputs)
      result.signatures = signatures
      result.successfulExtractions = signatures.length
      result.failedExtractions = inputs.length - signatures.length
      
      // Run vulnerability analysis
      const vulnAnalysis = analyzeSignaturesForVulnerabilities(signatures)
      result.vulnerabilities.nonceReuse = vulnAnalysis.nonceReuse.size
      result.vulnerabilities.biasedNonce = vulnAnalysis.biasedNonces.length
      result.vulnerabilities.smallR = vulnAnalysis.smallR.length
      result.vulnerabilities.relatedNonce = vulnAnalysis.relatedNonces.length
      
    } else if (fileType === 'transactions') {
      const transactions = parseTransactionsTSV(content)
      result.totalTransactions = transactions.length
      // Transactions file doesn't contain signatures directly
      // It's used for joining with inputs to calculate Z values
    } else if (fileType === 'outputs') {
      const outputs = parseOutputsTSV(content)
      // Outputs are used to look up scriptPubKey for Z calculation
      result.totalTransactions = outputs.length
    }
  } catch (error) {
    result.parseErrors.push(error instanceof Error ? error.message : 'Unknown parse error')
  }
  
  return result
}

/**
 * Convert extracted signatures to the format used by the signature analyzer
 */
export function convertToAnalyzerFormat(signatures: ExtractedSignature[]): ParsedSignature[] {
  return signatures.map(sig => ({
    r: sig.r,
    s: sig.s,
    v: sig.sighashType,
    hash: sig.transactionHash,
    address: sig.address || `block-${sig.blockId}`,
    blockNumber: sig.blockId,
    timestamp: sig.timestamp,
    sighash: sig.z.toString(16)
  }))
}

/**
 * Auto-detect file type from content
 */
export function detectBlockchairFileType(content: string): 'inputs' | 'outputs' | 'transactions' | 'unknown' {
  const firstLine = content.split('\n')[0].toLowerCase()
  
  if (firstLine.includes('spending_signature') || firstLine.includes('spending_witness')) {
    return 'inputs'
  }
  if (firstLine.includes('script_pub_key') && !firstLine.includes('spending')) {
    return 'outputs'
  }
  if (firstLine.includes('input_count') || firstLine.includes('output_count') || firstLine.includes('is_coinbase')) {
    return 'transactions'
  }
  
  return 'unknown'
}
