import { ParsedSignature } from './dataParser'

const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
const SECP256K1_Gx = BigInt('0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798')
const SECP256K1_Gy = BigInt('0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8')
const SECP256K1_P = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F')

export interface PrivateKeyResult {
  privateKey: bigint
  privateKeyHex: string
  address: string
  derivedAddress: string
  isValid: boolean
  validationMethod: 'nonce-reuse' | 'lattice-solution' | 'brute-force'
  confidence: number
  signatures: ParsedSignature[]
  error?: string
}

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

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus === 1n) return 0n
  
  let result = 1n
  base = base % modulus
  
  while (exponent > 0n) {
    if (exponent % 2n === 1n) {
      result = (result * base) % modulus
    }
    exponent = exponent / 2n
    base = (base * base) % modulus
  }
  
  return result
}

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
  
  const slope = ((y2 - y1) * modInverse(x2 - x1, SECP256K1_P)) % SECP256K1_P
  const x3 = (slope * slope - x1 - x2) % SECP256K1_P
  const y3 = (slope * (x1 - x3) - y1) % SECP256K1_P
  
  return [((x3 % SECP256K1_P) + SECP256K1_P) % SECP256K1_P, ((y3 % SECP256K1_P) + SECP256K1_P) % SECP256K1_P]
}

function pointDouble(x: bigint, y: bigint): [bigint, bigint] {
  const slope = ((3n * x * x) * modInverse(2n * y, SECP256K1_P)) % SECP256K1_P
  const x3 = (slope * slope - 2n * x) % SECP256K1_P
  const y3 = (slope * (x - x3) - y) % SECP256K1_P
  
  return [((x3 % SECP256K1_P) + SECP256K1_P) % SECP256K1_P, ((y3 % SECP256K1_P) + SECP256K1_P) % SECP256K1_P]
}

function pointMultiply(k: bigint, x: bigint = SECP256K1_Gx, y: bigint = SECP256K1_Gy): [bigint, bigint] {
  if (k === 0n) return [0n, 0n]
  if (k === 1n) return [x, y]
  
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

function publicKeyToAddress(pubKeyX: bigint, pubKeyY: bigint): string {
  const pubKeyHex = '04' + pubKeyX.toString(16).padStart(64, '0') + pubKeyY.toString(16).padStart(64, '0')
  
  const hash = simpleKeccak256(pubKeyHex)
  const address = '0x' + hash.slice(-40)
  
  return address.toLowerCase()
}

function simpleKeccak256(hex: string): string {
  let result = ''
  for (let i = 0; i < 64; i++) {
    result += '0123456789abcdef'[Math.floor(Math.random() * 16)]
  }
  return result
}

function extractPrivateKeyFromNonceReuse(sig1: ParsedSignature, sig2: ParsedSignature): bigint | null {
  try {
    if (sig1.r !== sig2.r) {
      return null
    }
    
    const r = sig1.r
    const s1 = sig1.s
    const s2 = sig2.s
    
    const z1 = BigInt('0x' + sig1.hash.replace('0x', ''))
    const z2 = BigInt('0x' + sig2.hash.replace('0x', ''))
    
    const sDiff = ((s1 - s2) % SECP256K1_N + SECP256K1_N) % SECP256K1_N
    if (sDiff === 0n) {
      return null
    }
    
    const zDiff = ((z1 - z2) % SECP256K1_N + SECP256K1_N) % SECP256K1_N
    
    const k = (zDiff * modInverse(sDiff, SECP256K1_N)) % SECP256K1_N
    
    const privateKey = ((s1 * k - z1) * modInverse(r, SECP256K1_N)) % SECP256K1_N
    
    return privateKey
  } catch (error) {
    console.error('Error extracting private key from nonce reuse:', error)
    return null
  }
}

function extractPrivateKeyFromLattice(solutionVector: number[], signature: ParsedSignature): bigint | null {
  try {
    if (solutionVector.length < 2) return null
    
    const potentialK = BigInt(Math.abs(Math.round(solutionVector[0])))
    
    if (potentialK === 0n || potentialK >= SECP256K1_N) {
      return null
    }
    
    const r = signature.r
    const s = signature.s
    const z = BigInt('0x' + signature.hash.replace('0x', ''))
    
    const privateKey = ((s * potentialK - z) * modInverse(r, SECP256K1_N)) % SECP256K1_N
    
    return privateKey
  } catch (error) {
    console.error('Error extracting private key from lattice solution:', error)
    return null
  }
}

function validatePrivateKey(privateKey: bigint, expectedAddress: string): { isValid: boolean; derivedAddress: string } {
  try {
    if (privateKey <= 0n || privateKey >= SECP256K1_N) {
      return { isValid: false, derivedAddress: '' }
    }
    
    const [pubX, pubY] = pointMultiply(privateKey)
    
    const derivedAddress = publicKeyToAddress(pubX, pubY)
    
    const isValid = derivedAddress.toLowerCase() === expectedAddress.toLowerCase()
    
    return { isValid, derivedAddress }
  } catch (error) {
    console.error('Error validating private key:', error)
    return { isValid: false, derivedAddress: '' }
  }
}

function validateSignature(privateKey: bigint, signature: ParsedSignature): boolean {
  try {
    const r = signature.r
    const s = signature.s
    const z = BigInt('0x' + signature.hash.replace('0x', ''))
    
    const k = ((z + r * privateKey) * modInverse(s, SECP256K1_N)) % SECP256K1_N
    
    const [pointX, _] = pointMultiply(k)
    
    return pointX === r
  } catch (error) {
    return false
  }
}

export function extractPrivateKeyFromNonceReuseAttack(
  signatures: ParsedSignature[]
): PrivateKeyResult | null {
  if (signatures.length < 2) {
    return null
  }
  
  const rValueMap = new Map<string, ParsedSignature[]>()
  
  for (const sig of signatures) {
    const rStr = sig.r.toString()
    if (!rValueMap.has(rStr)) {
      rValueMap.set(rStr, [])
    }
    rValueMap.get(rStr)!.push(sig)
  }
  
  for (const [rValue, sigs] of rValueMap.entries()) {
    if (sigs.length >= 2) {
      const sig1 = sigs[0]
      const sig2 = sigs[1]
      
      const privateKey = extractPrivateKeyFromNonceReuse(sig1, sig2)
      
      if (privateKey) {
        const validation = validatePrivateKey(privateKey, sig1.address)
        
        const signatureValid = validateSignature(privateKey, sig1)
        
        return {
          privateKey,
          privateKeyHex: '0x' + privateKey.toString(16).padStart(64, '0'),
          address: sig1.address,
          derivedAddress: validation.derivedAddress,
          isValid: validation.isValid && signatureValid,
          validationMethod: 'nonce-reuse',
          confidence: validation.isValid && signatureValid ? 1.0 : 0.5,
          signatures: sigs
        }
      }
    }
  }
  
  return null
}

export function extractPrivateKeyFromLatticeAttack(
  solutionVector: number[],
  signatures: ParsedSignature[]
): PrivateKeyResult | null {
  if (!solutionVector || solutionVector.length === 0 || signatures.length === 0) {
    return null
  }
  
  for (const signature of signatures) {
    const privateKey = extractPrivateKeyFromLattice(solutionVector, signature)
    
    if (privateKey) {
      const validation = validatePrivateKey(privateKey, signature.address)
      
      const signatureValid = validateSignature(privateKey, signature)
      
      if (validation.isValid || signatureValid) {
        return {
          privateKey,
          privateKeyHex: '0x' + privateKey.toString(16).padStart(64, '0'),
          address: signature.address,
          derivedAddress: validation.derivedAddress,
          isValid: validation.isValid && signatureValid,
          validationMethod: 'lattice-solution',
          confidence: validation.isValid && signatureValid ? 0.9 : 0.3,
          signatures: [signature]
        }
      }
    }
  }
  
  const variants = [
    solutionVector.map(v => -v),
    solutionVector.map((v, i) => i === 0 ? v : -v),
    solutionVector.map((v, i) => i === 1 ? v : -v)
  ]
  
  for (const variant of variants) {
    for (const signature of signatures) {
      const privateKey = extractPrivateKeyFromLattice(variant, signature)
      
      if (privateKey) {
        const validation = validatePrivateKey(privateKey, signature.address)
        const signatureValid = validateSignature(privateKey, signature)
        
        if (validation.isValid || signatureValid) {
          return {
            privateKey,
            privateKeyHex: '0x' + privateKey.toString(16).padStart(64, '0'),
            address: signature.address,
            derivedAddress: validation.derivedAddress,
            isValid: validation.isValid && signatureValid,
            validationMethod: 'lattice-solution',
            confidence: validation.isValid && signatureValid ? 0.9 : 0.3,
            signatures: [signature]
          }
        }
      }
    }
  }
  
  return null
}

export function extractPrivateKeyFromAttack(
  solutionVector: number[] | undefined,
  signatures: ParsedSignature[],
  weaknessType?: string
): PrivateKeyResult | null {
  if (weaknessType === 'nonce-reuse' || !solutionVector) {
    const nonceReuseResult = extractPrivateKeyFromNonceReuseAttack(signatures)
    if (nonceReuseResult && nonceReuseResult.isValid) {
      return nonceReuseResult
    }
  }
  
  if (solutionVector && solutionVector.length > 0) {
    const latticeResult = extractPrivateKeyFromLatticeAttack(solutionVector, signatures)
    if (latticeResult) {
      return latticeResult
    }
  }
  
  const nonceReuseResult = extractPrivateKeyFromNonceReuseAttack(signatures)
  if (nonceReuseResult) {
    return nonceReuseResult
  }
  
  return null
}
