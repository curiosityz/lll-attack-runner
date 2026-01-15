import { ParsedSignature } from './dataParser'

const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')

export interface HNPLatticeConfig {
  signatures: ParsedSignature[]
  knownBits: number
  latticeType: 'standard' | 'embedded' | 'kannan'
}

export interface HNPLatticeResult {
  basis: bigint[][]
  dimension: number
  scalingFactor: bigint
  isNormalized: boolean
  metadata: {
    signatureCount: number
    knownBits: number
    latticeType: string
    estimatedComplexity: string
  }
}

/**
 * Computes the modular inverse of a modulo m using extended Euclidean algorithm.
 */
function modInverse(a: bigint, m: bigint): bigint {
  a = ((a % m) + m) % m
  
  if (a === 0n) {
    throw new Error('No modular inverse exists')
  }
  
  let [old_r, r] = [a, m]
  let [old_s, s] = [1n, 0n]
  
  while (r !== 0n) {
    const quotient = old_r / r
    ;[old_r, r] = [r, old_r - quotient * r]
    ;[old_s, s] = [s, old_s - quotient * s]
  }
  
  if (old_r > 1n) {
    throw new Error('No modular inverse exists')
  }
  
  return ((old_s % m) + m) % m
}

/**
 * Computes the modular reduction of n modulo m, ensuring non-negative result.
 */
function mod(n: bigint, m: bigint): bigint {
  const result = n % m
  return result < 0n ? result + m : result
}

/**
 * Safely parses a hex string (with or without 0x prefix) to BigInt.
 * Returns 0n if parsing fails.
 */
function parseHexToBigInt(hexString: string): bigint {
  if (!hexString) return 0n
  try {
    const normalized = hexString.startsWith('0x') ? hexString : '0x' + hexString
    return BigInt(normalized)
  } catch {
    return 0n
  }
}

/**
 * Gets the message hash z from a parsed signature, preserving full 256-bit value.
 */
function getMessageHash(sig: ParsedSignature): bigint {
  if (sig.sighash) {
    return parseHexToBigInt(sig.sighash)
  }
  return parseHexToBigInt(sig.hash)
}

/**
 * Builds the standard Hidden Number Problem (HNP) lattice for ECDSA attack.
 * 
 * Uses BigInt throughout to preserve full 256-bit precision.
 * The lattice is constructed according to the standard HNP construction:
 * 
 * Row i (for i in 0..m): Vector with q (modulus) in position i
 * Last Row: Contains the biases [t_1, t_2, ..., t_m, 1/Scale]
 * 
 * Scaling Factor: We multiply by 2^256 (or curve order n) to prevent
 * the modulus from collapsing during reduction.
 */
export function buildHNPLattice(signatures: ParsedSignature[], knownBits: number = 4): HNPLatticeResult {
  const targetSigs = Math.max(40, Math.min(signatures.length, 80))
  const numSigs = Math.min(signatures.length, targetSigs)
  const sigs = signatures.slice(0, numSigs)
  
  // Use the curve order as the scaling factor (2^256 scale)
  const scalingFactor = SECP256K1_N
  const q = SECP256K1_N
  
  // Compute t_i = s_i^{-1} * r_i mod n for each signature
  // In ECDSA: s = k^{-1} * (z + r*d) mod n
  // So: k = s^{-1} * (z + r*d) mod n
  // The bias equation: k = s^{-1}*z + s^{-1}*r*d mod n
  // Let t_i = s_i^{-1} * r_i mod n, u_i = s_i^{-1} * z_i mod n
  // Then: k_i = u_i + t_i * d mod n
  const tValues: bigint[] = []
  const uValues: bigint[] = []
  
  for (const sig of sigs) {
    try {
      const sInv = modInverse(sig.s, q)
      const t = mod(sInv * sig.r, q)
      
      // Get the message hash z - preserve full 256-bit value
      const z = getMessageHash(sig)
      const u = mod(sInv * z, q)
      
      tValues.push(t)
      uValues.push(u)
    } catch (error) {
      // Modular inverse fails when s is not coprime with q (invalid signature)
      console.warn(`Failed to process signature ${sig.hash}: ${error instanceof Error ? error.message : 'unknown error'}`)
      tValues.push(0n)
      uValues.push(0n)
    }
  }
  
  // Lattice dimension: numSigs + 2 (for the secret d and the bound B)
  const dimension = numSigs + 2
  const basis: bigint[][] = []
  
  // Bound B for the nonce bias: 2^(256 - knownBits)
  const bound = q >> BigInt(knownBits)
  
  // Row 0 to numSigs-1: Identity-like structure with modulus q
  // Row i: [0, ..., q, ..., 0] with q in position i
  for (let i = 0; i < numSigs; i++) {
    const row: bigint[] = new Array(dimension).fill(0n)
    row[i] = q  // Modulus in position i
    basis.push(row)
  }
  
  // Row numSigs: The t-values row (bias row)
  // [t_0, t_1, ..., t_{m-1}, B, 0]
  const tRow: bigint[] = new Array(dimension).fill(0n)
  for (let i = 0; i < numSigs; i++) {
    tRow[i] = tValues[i]
  }
  tRow[numSigs] = bound  // Weight for the secret d
  basis.push(tRow)
  
  // Row numSigs+1: The u-values row (offset row) scaled
  // [u_0, u_1, ..., u_{m-1}, 0, 1]
  // This represents the known part that needs to be close to k_i
  const uRow: bigint[] = new Array(dimension).fill(0n)
  for (let i = 0; i < numSigs; i++) {
    uRow[i] = uValues[i]
  }
  uRow[dimension - 1] = 1n  // Scale factor for the solution (1/Scale conceptually)
  basis.push(uRow)
  
  return {
    basis,
    dimension,
    scalingFactor,
    isNormalized: false,
    metadata: {
      signatureCount: numSigs,
      knownBits,
      latticeType: 'standard',
      estimatedComplexity: estimateComplexity(dimension, knownBits)
    }
  }
}

/**
 * Builds an embedded HNP lattice with additional structure for better reduction.
 * 
 * Uses BigInt throughout to preserve full 256-bit precision.
 * The embedded construction provides additional constraints that can improve
 * the success rate of lattice reduction attacks.
 */
export function buildEmbeddedHNPLattice(signatures: ParsedSignature[], knownBits: number = 4): HNPLatticeResult {
  const targetSigs = Math.max(35, Math.min(signatures.length, 60))
  const numSigs = Math.min(signatures.length, targetSigs)
  const sigs = signatures.slice(0, numSigs)
  
  const scalingFactor = SECP256K1_N
  const q = SECP256K1_N
  
  // Compute t_i and u_i values - preserving full precision
  const tValues: bigint[] = []
  const uValues: bigint[] = []
  
  for (const sig of sigs) {
    try {
      const sInv = modInverse(sig.s, q)
      const t = mod(sInv * sig.r, q)
      
      // Get the message hash z - preserve full 256-bit value
      const z = getMessageHash(sig)
      const u = mod(sInv * z, q)
      
      tValues.push(t)
      uValues.push(u)
    } catch (error) {
      console.warn(`Failed to process signature ${sig.hash}: ${error instanceof Error ? error.message : 'unknown error'}`)
      tValues.push(0n)
      uValues.push(0n)
    }
  }
  
  // Embedded lattice: dimension = 2*numSigs + 1
  // First numSigs rows: modulus constraints
  // Next numSigs rows: hash embedding
  // Last row: target vector
  const dimension = numSigs * 2 + 1
  const basis: bigint[][] = []
  
  // Bound B for the nonce bias
  const bound = q >> BigInt(knownBits)
  
  // First numSigs rows: [0, ..., q, ..., 0, | 0, ..., 0]
  // Modulus in the first block
  for (let i = 0; i < numSigs; i++) {
    const row: bigint[] = new Array(dimension).fill(0n)
    row[i] = q
    basis.push(row)
  }
  
  // Next numSigs rows: [t_i, 0, ..., 0, | B, 0, ..., 0, | u_i embedding]
  // These encode the ECDSA equation relationships
  for (let i = 0; i < numSigs; i++) {
    const row: bigint[] = new Array(dimension).fill(0n)
    row[i] = tValues[i]  // t_i in position i
    row[numSigs + i] = bound  // Weight in second block
    basis.push(row)
  }
  
  // Last row: bias/target row with u values and final scale
  const lastRow: bigint[] = new Array(dimension).fill(0n)
  for (let i = 0; i < numSigs; i++) {
    lastRow[numSigs + i] = uValues[i]
  }
  lastRow[dimension - 1] = bound * 2n  // Larger weight for target
  basis.push(lastRow)
  
  return {
    basis,
    dimension,
    scalingFactor,
    isNormalized: false,
    metadata: {
      signatureCount: numSigs,
      knownBits,
      latticeType: 'embedded',
      estimatedComplexity: estimateComplexity(dimension, knownBits)
    }
  }
}

/**
 * Builds a Kannan embedding lattice for the HNP attack.
 * 
 * Uses BigInt throughout to preserve full 256-bit precision.
 * The Kannan embedding adds an extra dimension to convert CVP to SVP,
 * which can improve lattice reduction success in some cases.
 */
export function buildKannanEmbeddingLattice(signatures: ParsedSignature[], knownBits: number = 4): HNPLatticeResult {
  const targetSigs = Math.max(40, Math.min(signatures.length, 70))
  const numSigs = Math.min(signatures.length, targetSigs)
  const sigs = signatures.slice(0, numSigs)
  
  const scalingFactor = SECP256K1_N
  const q = SECP256K1_N
  
  // Compute t_i and u_i values - preserving full precision
  const tValues: bigint[] = []
  const uValues: bigint[] = []
  
  for (const sig of sigs) {
    try {
      const sInv = modInverse(sig.s, q)
      const t = mod(sInv * sig.r, q)
      
      // Get the message hash z - preserve full 256-bit value
      const z = getMessageHash(sig)
      const u = mod(sInv * z, q)
      
      tValues.push(t)
      uValues.push(u)
    } catch (error) {
      console.warn(`Failed to process signature ${sig.hash}: ${error instanceof Error ? error.message : 'unknown error'}`)
      tValues.push(0n)
      uValues.push(0n)
    }
  }
  
  // Kannan embedding: dimension = numSigs + 2
  // Rows 0 to numSigs-1: modulus constraints
  // Row numSigs: t-values with bound
  // Row numSigs+1: Kannan embedding row (target)
  const dimension = numSigs + 2
  const basis: bigint[][] = []
  
  // Bound B for the nonce bias
  const bound = q >> BigInt(knownBits)
  // Kannan embedding weight (large value to ensure correct solution)
  const M = q
  
  // First numSigs rows: [0, ..., q, ..., 0, 0, 0]
  for (let i = 0; i < numSigs; i++) {
    const row: bigint[] = new Array(dimension).fill(0n)
    row[i] = q
    basis.push(row)
  }
  
  // Row numSigs: [t_0, t_1, ..., t_{m-1}, B, 0]
  // This encodes the linear relationship with the secret
  const tRow: bigint[] = new Array(dimension).fill(0n)
  for (let i = 0; i < numSigs; i++) {
    tRow[i] = tValues[i]
  }
  tRow[numSigs] = bound
  basis.push(tRow)
  
  // Row numSigs+1: Kannan embedding target row
  // [u_0, u_1, ..., u_{m-1}, 0, M]
  const targetRow: bigint[] = new Array(dimension).fill(0n)
  for (let i = 0; i < numSigs; i++) {
    targetRow[i] = uValues[i]
  }
  targetRow[dimension - 1] = M
  basis.push(targetRow)
  
  return {
    basis,
    dimension,
    scalingFactor,
    isNormalized: false,
    metadata: {
      signatureCount: numSigs,
      knownBits,
      latticeType: 'kannan',
      estimatedComplexity: estimateComplexity(dimension, knownBits)
    }
  }
}

function estimateComplexity(dimension: number, knownBits: number): string {
  const approxOps = Math.pow(dimension, 3) * Math.pow(2, knownBits)
  
  if (approxOps < 1e6) return 'Low (< 1s)'
  if (approxOps < 1e8) return 'Medium (1-10s)'
  if (approxOps < 1e10) return 'High (10-60s)'
  return 'Very High (> 1min)'
}

export function selectOptimalLatticeType(signatureCount: number, knownBits: number): 'standard' | 'embedded' | 'kannan' {
  if (signatureCount < 10) {
    return 'standard'
  }
  
  if (signatureCount >= 40) {
    return knownBits >= 4 ? 'embedded' : 'standard'
  }
  
  if (signatureCount >= 20 && signatureCount < 40) {
    return 'kannan'
  }
  
  return 'standard'
}
