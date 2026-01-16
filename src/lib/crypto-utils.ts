/**
 * Cryptographic Utilities Module
 * 
 * This module provides robust implementations of cryptographic functions
 * needed for ECDSA signature analysis and private key operations.
 * 
 * Includes:
 * - SHA256 (using Web Crypto API)
 * - RIPEMD160 (pure JavaScript implementation)
 * - Keccak256 (pure JavaScript implementation for Ethereum compatibility)
 * - Double SHA256 (for Bitcoin)
 * - Base58Check encoding (for Bitcoin addresses and WIF)
 */

// ============================================================================
// SHA-256 (using Web Crypto API)
// ============================================================================

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex
  if (cleaned.length % 2 !== 0) {
    throw new Error('Invalid hex string length')
  }
  const bytes = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16)
  }
  return bytes
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * SHA-256 hash using Web Crypto API
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API not available')
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(hashBuffer)
}

/**
 * Double SHA-256 hash (used in Bitcoin)
 */
export async function doubleSha256(data: Uint8Array): Promise<Uint8Array> {
  const hash1 = await sha256(data)
  return await sha256(hash1)
}

// ============================================================================
// RIPEMD-160 (Pure JavaScript Implementation)
// ============================================================================

/**
 * RIPEMD-160 hash function
 * Used in Bitcoin for address generation: RIPEMD160(SHA256(pubkey))
 */
export function ripemd160(data: Uint8Array): Uint8Array {
  // Constants
  const K1 = [0x00000000, 0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xA953FD4E]
  const K2 = [0x50A28BE6, 0x5C4DD124, 0x6D703EF3, 0x7A6D76E9, 0x00000000]

  // Selection of message word
  const R1 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
              7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
              3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
              1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
              4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13]
  const R2 = [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
              6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
              15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
              8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
              12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11]

  // Amounts for rotate left (rol)
  const S1 = [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
              7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
              11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
              11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
              9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6]
  const S2 = [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
              9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
              9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
              15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
              8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11]

  function rotl(x: number, n: number): number {
    return ((x << n) | (x >>> (32 - n))) >>> 0
  }

  function f(j: number, x: number, y: number, z: number): number {
    if (j < 16) return (x ^ y ^ z) >>> 0
    if (j < 32) return ((x & y) | (~x & z)) >>> 0
    if (j < 48) return ((x | ~y) ^ z) >>> 0
    if (j < 64) return ((x & z) | (y & ~z)) >>> 0
    return (x ^ (y | ~z)) >>> 0
  }

  // Padding
  const msgLen = data.length
  const bitLen = msgLen * 8
  const msgMod64 = msgLen % 64
  const padLen = msgMod64 < 56 ? 56 - msgMod64 : 120 - msgMod64
  const padded = new Uint8Array(msgLen + padLen + 8)
  padded.set(data)
  padded[msgLen] = 0x80
  // Little-endian length
  for (let i = 0; i < 8; i++) {
    padded[msgLen + padLen + i] = (bitLen >>> (8 * i)) & 0xff
  }

  // Initialize hash values
  let h0 = 0x67452301
  let h1 = 0xEFCDAB89
  let h2 = 0x98BADCFE
  let h3 = 0x10325476
  let h4 = 0xC3D2E1F0

  // Process each 64-byte block
  for (let i = 0; i < padded.length; i += 64) {
    const X: number[] = []
    for (let j = 0; j < 16; j++) {
      X[j] = padded[i + j * 4] | (padded[i + j * 4 + 1] << 8) |
             (padded[i + j * 4 + 2] << 16) | (padded[i + j * 4 + 3] << 24)
      X[j] = X[j] >>> 0
    }

    let A1 = h0, B1 = h1, C1 = h2, D1 = h3, E1 = h4
    let A2 = h0, B2 = h1, C2 = h2, D2 = h3, E2 = h4

    for (let j = 0; j < 80; j++) {
      const round1 = Math.floor(j / 16)
      const round2 = Math.floor(j / 16)

      let T = (A1 + f(j, B1, C1, D1) + X[R1[j]] + K1[round1]) >>> 0
      T = (rotl(T, S1[j]) + E1) >>> 0
      A1 = E1
      E1 = D1
      D1 = rotl(C1, 10)
      C1 = B1
      B1 = T

      T = (A2 + f(79 - j, B2, C2, D2) + X[R2[j]] + K2[round2]) >>> 0
      T = (rotl(T, S2[j]) + E2) >>> 0
      A2 = E2
      E2 = D2
      D2 = rotl(C2, 10)
      C2 = B2
      B2 = T
    }

    const T = (h1 + C1 + D2) >>> 0
    h1 = (h2 + D1 + E2) >>> 0
    h2 = (h3 + E1 + A2) >>> 0
    h3 = (h4 + A1 + B2) >>> 0
    h4 = (h0 + B1 + C2) >>> 0
    h0 = T
  }

  // Output (little-endian)
  const result = new Uint8Array(20)
  for (let i = 0; i < 4; i++) {
    result[i] = (h0 >>> (8 * i)) & 0xff
    result[i + 4] = (h1 >>> (8 * i)) & 0xff
    result[i + 8] = (h2 >>> (8 * i)) & 0xff
    result[i + 12] = (h3 >>> (8 * i)) & 0xff
    result[i + 16] = (h4 >>> (8 * i)) & 0xff
  }

  return result
}

/**
 * Hash160 = RIPEMD160(SHA256(data))
 * Used in Bitcoin for address generation
 */
export async function hash160(data: Uint8Array): Promise<Uint8Array> {
  const sha256Hash = await sha256(data)
  return ripemd160(sha256Hash)
}

// ============================================================================
// Keccak-256 (for Ethereum compatibility)
// ============================================================================

/**
 * Keccak-256 hash function (used by Ethereum)
 * This is a complete implementation following the Keccak specification
 */
export function keccak256(data: Uint8Array): Uint8Array {
  const ROUNDS = 24
  const RATE = 136 // 1088 bits for keccak-256
  const OUTPUT_LEN = 32

  // Round constants
  const RC: bigint[] = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
    0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
    0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
    0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
    0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
    0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
    0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ]

  // Rotation offsets
  const RO = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14]
  ]

  // Pad the message (Keccak padding: append 01, then 10*1)
  // We need at least 2 bytes for padding (01 at start, 80 at end)
  // When data.length + 1 is already a multiple of RATE, we need an extra block
  const paddedLen = Math.ceil((data.length + 2) / RATE) * RATE
  const padded = new Uint8Array(paddedLen)
  padded.set(data)
  padded[data.length] = 0x01
  padded[padded.length - 1] |= 0x80

  // Initialize state
  const state: bigint[][] = Array(5).fill(null).map(() => Array(5).fill(0n))

  // Absorb phase
  for (let blockStart = 0; blockStart < padded.length; blockStart += RATE) {
    // XOR block into state
    for (let i = 0; i < RATE; i += 8) {
      const x = (i / 8) % 5
      const y = Math.floor((i / 8) / 5)
      if (y < 5) {
        let lane = 0n
        for (let j = 0; j < 8; j++) {
          lane |= BigInt(padded[blockStart + i + j]) << BigInt(j * 8)
        }
        state[x][y] ^= lane
      }
    }

    // Keccak-f permutation
    for (let round = 0; round < ROUNDS; round++) {
      // θ (theta)
      const C: bigint[] = Array(5).fill(0n)
      for (let x = 0; x < 5; x++) {
        C[x] = state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4]
      }
      const D: bigint[] = Array(5).fill(0n)
      for (let x = 0; x < 5; x++) {
        D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1n)
      }
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          state[x][y] ^= D[x]
        }
      }

      // ρ (rho) and π (pi)
      const B: bigint[][] = Array(5).fill(null).map(() => Array(5).fill(0n))
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          B[y][(2 * x + 3 * y) % 5] = rotl64(state[x][y], BigInt(RO[x][y]))
        }
      }

      // χ (chi)
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          state[x][y] = B[x][y] ^ ((~B[(x + 1) % 5][y]) & B[(x + 2) % 5][y])
        }
      }

      // ι (iota)
      state[0][0] ^= RC[round]
    }
  }

  // Squeeze phase (just one block for keccak-256)
  const output = new Uint8Array(OUTPUT_LEN)
  let outIdx = 0
  for (let y = 0; y < 5 && outIdx < OUTPUT_LEN; y++) {
    for (let x = 0; x < 5 && outIdx < OUTPUT_LEN; x++) {
      const lane = state[x][y]
      for (let i = 0; i < 8 && outIdx < OUTPUT_LEN; i++) {
        output[outIdx++] = Number((lane >> BigInt(i * 8)) & 0xffn)
      }
    }
  }

  return output
}

function rotl64(x: bigint, n: bigint): bigint {
  n = n % 64n
  return ((x << n) | (x >> (64n - n))) & 0xffffffffffffffffn
}

/**
 * Keccak-256 hash of a hex string, returns hex
 */
export function keccak256Hex(hex: string): string {
  const bytes = hexToBytes(hex)
  const hash = keccak256(bytes)
  return bytesToHex(hash)
}

// ============================================================================
// Base58 and Base58Check Encoding
// ============================================================================

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/**
 * Encode bytes as Base58
 */
export function base58Encode(bytes: Uint8Array): string {
  let num = 0n
  for (const byte of bytes) {
    num = num * 256n + BigInt(byte)
  }

  let result = ''
  while (num > 0n) {
    const remainder = Number(num % 58n)
    result = BASE58_ALPHABET[remainder] + result
    num = num / 58n
  }

  // Add leading '1's for leading zero bytes
  for (const byte of bytes) {
    if (byte === 0) {
      result = '1' + result
    } else {
      break
    }
  }

  return result
}

/**
 * Base58Check encoding (used for Bitcoin addresses and WIF)
 * Adds a 4-byte checksum (first 4 bytes of double SHA256)
 */
export async function base58CheckEncode(payload: Uint8Array): Promise<string> {
  const checksum = await doubleSha256(payload)
  const withChecksum = new Uint8Array(payload.length + 4)
  withChecksum.set(payload)
  withChecksum.set(checksum.slice(0, 4), payload.length)
  return base58Encode(withChecksum)
}

// ============================================================================
// Bitcoin Address Generation
// ============================================================================

/**
 * Derive a Bitcoin P2PKH address from a public key
 * 
 * @param pubKeyX - X coordinate of the public key
 * @param pubKeyY - Y coordinate of the public key
 * @param compressed - Whether to use compressed public key format (default: true)
 * @param testnet - Whether to use testnet (default: false)
 * @returns Bitcoin address in Base58Check format
 */
export async function publicKeyToBitcoinAddress(
  pubKeyX: bigint,
  pubKeyY: bigint,
  compressed: boolean = true,
  testnet: boolean = false
): Promise<string> {
  // Create public key bytes
  let pubKeyBytes: Uint8Array
  
  if (compressed) {
    // Compressed format: 02/03 + x-coordinate (33 bytes)
    const prefix = (pubKeyY & 1n) === 0n ? 0x02 : 0x03
    pubKeyBytes = new Uint8Array(33)
    pubKeyBytes[0] = prefix
    const xBytes = hexToBytes(pubKeyX.toString(16).padStart(64, '0'))
    pubKeyBytes.set(xBytes, 1)
  } else {
    // Uncompressed format: 04 + x-coordinate + y-coordinate (65 bytes)
    pubKeyBytes = new Uint8Array(65)
    pubKeyBytes[0] = 0x04
    const xBytes = hexToBytes(pubKeyX.toString(16).padStart(64, '0'))
    const yBytes = hexToBytes(pubKeyY.toString(16).padStart(64, '0'))
    pubKeyBytes.set(xBytes, 1)
    pubKeyBytes.set(yBytes, 33)
  }
  
  // Hash160 = RIPEMD160(SHA256(pubkey))
  const pubKeyHash = await hash160(pubKeyBytes)
  
  // Add version byte (0x00 for mainnet, 0x6f for testnet)
  const versionByte = testnet ? 0x6f : 0x00
  const payload = new Uint8Array(21)
  payload[0] = versionByte
  payload.set(pubKeyHash, 1)
  
  // Base58Check encode
  return await base58CheckEncode(payload)
}

/**
 * Derive an Ethereum address from a public key
 * 
 * @param pubKeyX - X coordinate of the public key
 * @param pubKeyY - Y coordinate of the public key
 * @returns Ethereum address (0x prefixed, lowercase)
 */
export function publicKeyToEthereumAddress(
  pubKeyX: bigint,
  pubKeyY: bigint
): string {
  // Ethereum uses uncompressed public key without the 04 prefix for hashing
  const pubKeyHex = pubKeyX.toString(16).padStart(64, '0') + pubKeyY.toString(16).padStart(64, '0')
  const pubKeyBytes = hexToBytes(pubKeyHex)
  
  // Keccak256 hash
  const hash = keccak256(pubKeyBytes)
  
  // Take last 20 bytes (40 hex chars)
  const address = '0x' + bytesToHex(hash.slice(12))
  
  return address.toLowerCase()
}

// ============================================================================
// WIF (Wallet Import Format) Encoding
// ============================================================================

/**
 * Convert a private key to WIF (Wallet Import Format)
 * 
 * @param privateKey - The private key as a bigint
 * @param compressed - Whether the corresponding public key is compressed (default: true)
 * @param testnet - Whether to use testnet (default: false)
 * @returns WIF encoded private key
 */
export async function privateKeyToWIF(
  privateKey: bigint,
  compressed: boolean = true,
  testnet: boolean = false
): Promise<string> {
  // Version byte: 0x80 for mainnet, 0xef for testnet
  const versionByte = testnet ? 0xef : 0x80
  
  // Private key as 32 bytes
  const privateKeyHex = privateKey.toString(16).padStart(64, '0')
  const privateKeyBytes = hexToBytes(privateKeyHex)
  
  // Build payload: version + private key + (optional compression flag)
  const payloadLength = compressed ? 34 : 33
  const payload = new Uint8Array(payloadLength)
  payload[0] = versionByte
  payload.set(privateKeyBytes, 1)
  if (compressed) {
    payload[33] = 0x01
  }
  
  // Base58Check encode
  return await base58CheckEncode(payload)
}
