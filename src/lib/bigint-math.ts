export const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
export const SECP256K1_P = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F')
export const SECP256K1_GX = BigInt('0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798')
export const SECP256K1_GY = BigInt('0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8')

export class BigIntMatrix {
  rows: bigint[][]
  
  constructor(rows: bigint[][]) {
    this.rows = rows.map(row => [...row])
  }
  
  get rowCount(): number {
    return this.rows.length
  }
  
  get colCount(): number {
    return this.rows[0]?.length || 0
  }
  
  getRow(i: number): bigint[] {
    return [...this.rows[i]]
  }
  
  setRow(i: number, row: bigint[]): void {
    this.rows[i] = [...row]
  }
  
  clone(): BigIntMatrix {
    return new BigIntMatrix(this.rows)
  }
  
  toNumberArray(): number[][] {
    return this.rows.map(row => row.map(v => Number(v)))
  }
  
  static fromNumberArray(arr: number[][]): BigIntMatrix {
    return new BigIntMatrix(arr.map(row => row.map(v => BigInt(Math.floor(v)))))
  }
}

export function modInverse(a: bigint, m: bigint): bigint {
  a = mod(a, m)
  
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
  
  return mod(old_s, m)
}

export function mod(n: bigint, m: bigint): bigint {
  const result = n % m
  return result < 0n ? result + m : result
}

export function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a
  b = b < 0n ? -b : b
  
  while (b !== 0n) {
    [a, b] = [b, a % b]
  }
  
  return a
}

export function extendedGCD(a: bigint, b: bigint): { gcd: bigint; x: bigint; y: bigint } {
  if (b === 0n) {
    return { gcd: a, x: 1n, y: 0n }
  }
  
  let [old_r, r] = [a, b]
  let [old_s, s] = [1n, 0n]
  let [old_t, t] = [0n, 1n]
  
  while (r !== 0n) {
    const quotient = old_r / r
    ;[old_r, r] = [r, old_r - quotient * r]
    ;[old_s, s] = [s, old_s - quotient * s]
    ;[old_t, t] = [t, old_t - quotient * t]
  }
  
  return { gcd: old_r, x: old_s, y: old_t }
}

export function sqrt(n: bigint): bigint {
  if (n < 0n) {
    throw new Error('Cannot compute square root of negative number')
  }
  
  if (n === 0n) return 0n
  if (n === 1n) return 1n
  
  let x = n
  let y = (x + 1n) / 2n
  
  while (y < x) {
    x = y
    y = (x + n / x) / 2n
  }
  
  return x
}

export function modSqrt(n: bigint, p: bigint): bigint | null {
  if (modPow(n, (p - 1n) / 2n, p) !== 1n) {
    return null
  }
  
  if (p % 4n === 3n) {
    return modPow(n, (p + 1n) / 4n, p)
  }
  
  let q = p - 1n
  let s = 0n
  while (q % 2n === 0n) {
    q /= 2n
    s += 1n
  }
  
  let z = 2n
  while (modPow(z, (p - 1n) / 2n, p) !== p - 1n) {
    z += 1n
  }
  
  let m = s
  let c = modPow(z, q, p)
  let t = modPow(n, q, p)
  let r = modPow(n, (q + 1n) / 2n, p)
  
  while (t !== 1n) {
    let i = 1n
    let temp = (t * t) % p
    while (temp !== 1n && i < m) {
      temp = (temp * temp) % p
      i += 1n
    }
    
    const b = modPow(c, 1n << (m - i - 1n), p)
    m = i
    c = (b * b) % p
    t = (t * c) % p
    r = (r * b) % p
  }
  
  return r
}

export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus === 1n) return 0n
  
  let result = 1n
  base = mod(base, modulus)
  
  while (exponent > 0n) {
    if (exponent % 2n === 1n) {
      result = mod(result * base, modulus)
    }
    exponent = exponent >> 1n
    base = mod(base * base, modulus)
  }
  
  return result
}

export function isPointOnCurve(x: bigint, y: bigint): boolean {
  const left = mod(y * y, SECP256K1_P)
  const right = mod(x * x * x + 7n, SECP256K1_P)
  return left === right
}

export function pointDouble(x: bigint, y: bigint): { x: bigint; y: bigint } {
  const s = mod((3n * x * x) * modInverse(2n * y, SECP256K1_P), SECP256K1_P)
  const x3 = mod(s * s - 2n * x, SECP256K1_P)
  const y3 = mod(s * (x - x3) - y, SECP256K1_P)
  return { x: x3, y: y3 }
}

export function pointAdd(
  x1: bigint,
  y1: bigint,
  x2: bigint,
  y2: bigint
): { x: bigint; y: bigint } {
  if (x1 === x2 && y1 === y2) {
    return pointDouble(x1, y1)
  }
  
  if (x1 === x2) {
    throw new Error('Points are inverses')
  }
  
  const s = mod((y2 - y1) * modInverse(x2 - x1, SECP256K1_P), SECP256K1_P)
  const x3 = mod(s * s - x1 - x2, SECP256K1_P)
  const y3 = mod(s * (x1 - x3) - y1, SECP256K1_P)
  return { x: x3, y: y3 }
}

export function pointMultiply(k: bigint, x: bigint = SECP256K1_GX, y: bigint = SECP256K1_GY): { x: bigint; y: bigint } | null {
  k = mod(k, SECP256K1_N)
  
  if (k === 0n) {
    return null
  }
  
  if (k === 1n) {
    return { x, y }
  }
  
  let result: { x: bigint; y: bigint } | null = null
  let addend = { x, y }
  
  while (k > 0n) {
    if (k & 1n) {
      if (result === null) {
        result = addend
      } else {
        result = pointAdd(result.x, result.y, addend.x, addend.y)
      }
    }
    addend = pointDouble(addend.x, addend.y)
    k = k >> 1n
  }
  
  return result
}

export function recoverPublicKeyFromSignature(
  r: bigint,
  s: bigint,
  z: bigint,
  recoveryId: number
): { x: bigint; y: bigint } | null {
  const isYOdd = (recoveryId & 1) === 1
  const isSecondKey = (recoveryId & 2) === 2
  
  let x = r
  if (isSecondKey) {
    x = r + SECP256K1_N
  }
  
  if (x >= SECP256K1_P) {
    return null
  }
  
  const ySq = mod(x * x * x + 7n, SECP256K1_P)
  let y = modSqrt(ySq, SECP256K1_P)
  
  if (y === null) {
    return null
  }
  
  const yIsOdd = (y & 1n) === 1n
  if (yIsOdd !== isYOdd) {
    y = SECP256K1_P - y
  }
  
  if (!isPointOnCurve(x, y)) {
    return null
  }
  
  const rInv = modInverse(r, SECP256K1_N)
  
  const u1 = mod(-z * rInv, SECP256K1_N)
  const u2 = mod(s * rInv, SECP256K1_N)
  
  const point1 = pointMultiply(u1)
  const point2 = pointMultiply(u2, x, y)
  
  if (point1 === null || point2 === null) {
    return null
  }
  
  return pointAdd(point1.x, point1.y, point2.x, point2.y)
}

export function derivePrivateKeyFromNonceReuse(
  r: bigint,
  s1: bigint,
  s2: bigint,
  z1: bigint,
  z2: bigint
): bigint | null {
  const sDiff = mod(s1 - s2, SECP256K1_N)
  const zDiff = mod(z1 - z2, SECP256K1_N)
  
  if (sDiff === 0n) {
    return null
  }
  
  try {
    const k = mod(zDiff * modInverse(sDiff, SECP256K1_N), SECP256K1_N)
    
    const rInv = modInverse(r, SECP256K1_N)
    const privateKey = mod((s1 * k - z1) * rInv, SECP256K1_N)
    
    return privateKey
  } catch {
    return null
  }
}

export function verifyPrivateKey(privateKey: bigint, publicKey: { x: bigint; y: bigint }): boolean {
  const derived = pointMultiply(privateKey)
  if (derived === null) {
    return false
  }
  return derived.x === publicKey.x && derived.y === publicKey.y
}

export function privateKeyToHex(privateKey: bigint): string {
  return privateKey.toString(16).padStart(64, '0')
}

export function publicKeyToAddress(x: bigint, y: bigint): string {
  const pubKeyBytes = x.toString(16).padStart(64, '0') + y.toString(16).padStart(64, '0')
  
  return '0x' + pubKeyBytes.slice(0, 40)
}

export function bigintAbs(n: bigint): bigint {
  return n < 0n ? -n : n
}

export function bigintMin(...values: bigint[]): bigint {
  if (values.length === 0) throw new Error('No values provided')
  return values.reduce((min, val) => val < min ? val : min)
}

export function bigintMax(...values: bigint[]): bigint {
  if (values.length === 0) throw new Error('No values provided')
  return values.reduce((max, val) => val > max ? val : max)
}

export function dotProduct(a: bigint[], b: bigint[]): bigint {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length')
  }
  
  let sum = 0n
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i]
  }
  return sum
}

export function vectorNorm(v: bigint[]): bigint {
  const sumSquares = v.reduce((sum, val) => sum + val * val, 0n)
  return sqrt(sumSquares)
}

export function scaleVector(v: bigint[], scalar: bigint): bigint[] {
  return v.map(val => val * scalar)
}

export function addVectors(a: bigint[], b: bigint[]): bigint[] {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length')
  }
  return a.map((val, i) => val + b[i])
}

export function subtractVectors(a: bigint[], b: bigint[]): bigint[] {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length')
  }
  return a.map((val, i) => val - b[i])
}

export function gramSchmidt(basis: bigint[][]): bigint[][] {
  const n = basis.length
  const orthogonal: bigint[][] = []
  
  for (let i = 0; i < n; i++) {
    let v = [...basis[i]]
    
    for (let j = 0; j < i; j++) {
      const proj = dotProduct(basis[i], orthogonal[j])
      const norm = dotProduct(orthogonal[j], orthogonal[j])
      
      if (norm !== 0n) {
        const scale = (proj * 1000000n) / norm
        const scaled = scaleVector(orthogonal[j], scale)
        const scaledDown = scaled.map(x => x / 1000000n)
        v = subtractVectors(v, scaledDown)
      }
    }
    
    orthogonal.push(v)
  }
  
  return orthogonal
}

export function convertToSafeNumbers(matrix: bigint[][], maxBits: number = 48): number[][] {
  const maxValue = 2n ** BigInt(maxBits)
  
  const flatValues = matrix.flat().map(v => bigintAbs(v))
  const maxInMatrix = bigintMax(...flatValues, 1n)
  
  const scale = maxInMatrix > maxValue ? maxValue : maxInMatrix
  const scaleFactor = Number(scale)
  
  return matrix.map(row => 
    row.map(val => {
      if (scale === 1n) return Number(val)
      const scaled = (val * maxValue) / maxInMatrix
      return Number(scaled)
    })
  )
}

export function convertFromSafeNumbers(matrix: number[][], originalScale: bigint): bigint[][] {
  const maxValue = 2n ** 48n
  
  return matrix.map(row =>
    row.map(val => {
      const bigVal = BigInt(Math.round(val))
      return (bigVal * originalScale) / maxValue
    })
  )
}
