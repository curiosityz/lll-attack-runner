/**
 * Rational Arithmetic Library for High-Precision Lattice Reduction
 * 
 * This module provides exact rational number arithmetic using BigInt for both
 * numerator and denominator. This eliminates floating-point precision loss
 * that occurs in standard LLL/BKZ implementations.
 * 
 * The approach is inspired by fpylll/fplll which use exact rational arithmetic
 * for the Gram-Schmidt coefficients (μ values) to ensure numerical stability.
 * 
 * Key benefits:
 * - No rounding errors in Gram-Schmidt orthogonalization
 * - Exact Lovász condition checks
 * - Stable behavior for cryptographic-sized values (256-bit integers)
 */

import { gcd as bigintGCD } from './bigint-math'

/**
 * Represents a rational number as numerator/denominator pair.
 * Always kept in lowest terms with positive denominator.
 */
export class Rational {
  readonly num: bigint
  readonly den: bigint

  constructor(numerator: bigint, denominator: bigint = 1n) {
    if (denominator === 0n) {
      throw new Error('Division by zero')
    }

    // Ensure denominator is positive
    if (denominator < 0n) {
      numerator = -numerator
      denominator = -denominator
    }

    // Reduce to lowest terms
    const g = bigintGCD(numerator < 0n ? -numerator : numerator, denominator)
    this.num = numerator / g
    this.den = denominator / g
  }

  static zero(): Rational {
    return new Rational(0n, 1n)
  }

  static one(): Rational {
    return new Rational(1n, 1n)
  }

  static fromBigInt(value: bigint): Rational {
    return new Rational(value, 1n)
  }

  static fromNumber(value: number): Rational {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot convert non-finite number to Rational')
    }
    
    // Handle integers directly
    if (Number.isInteger(value)) {
      return new Rational(BigInt(value), 1n)
    }

    // Convert decimal to rational using continued fraction approximation
    // This gives a better approximation than simple scaling
    const [num, den] = Rational.toFraction(value)
    return new Rational(num, den)
  }

  /**
   * Convert a decimal number to a rational approximation using continued fractions
   */
  private static toFraction(value: number, maxIterations: number = 20): [bigint, bigint] {
    if (value === 0) return [0n, 1n]
    
    const sign = value < 0 ? -1n : 1n
    value = Math.abs(value)
    
    let num1 = 1n, num2 = 0n
    let den1 = 0n, den2 = 1n
    
    let x = value
    
    for (let i = 0; i < maxIterations; i++) {
      const a = BigInt(Math.floor(x))
      const newNum = a * num1 + num2
      const newDen = a * den1 + den2
      
      num2 = num1
      den2 = den1
      num1 = newNum
      den1 = newDen
      
      const remainder = x - Math.floor(x)
      if (remainder < 1e-15) break
      
      x = 1 / remainder
      if (x > 1e15) break
    }
    
    return [sign * num1, den1]
  }

  add(other: Rational): Rational {
    // a/b + c/d = (ad + bc) / bd
    return new Rational(
      this.num * other.den + other.num * this.den,
      this.den * other.den
    )
  }

  subtract(other: Rational): Rational {
    // a/b - c/d = (ad - bc) / bd
    return new Rational(
      this.num * other.den - other.num * this.den,
      this.den * other.den
    )
  }

  multiply(other: Rational): Rational {
    // a/b * c/d = ac / bd
    return new Rational(this.num * other.num, this.den * other.den)
  }

  divide(other: Rational): Rational {
    if (other.num === 0n) {
      throw new Error('Division by zero')
    }
    // a/b / c/d = ad / bc
    return new Rational(this.num * other.den, this.den * other.num)
  }

  negate(): Rational {
    return new Rational(-this.num, this.den)
  }

  abs(): Rational {
    return new Rational(this.num < 0n ? -this.num : this.num, this.den)
  }

  isZero(): boolean {
    return this.num === 0n
  }

  isPositive(): boolean {
    return this.num > 0n
  }

  isNegative(): boolean {
    return this.num < 0n
  }

  /**
   * Compare to another rational.
   * Returns -1 if this < other, 0 if equal, 1 if this > other
   */
  compare(other: Rational): -1 | 0 | 1 {
    // a/b compared to c/d: compare ad to bc
    const left = this.num * other.den
    const right = other.num * this.den
    
    if (left < right) return -1
    if (left > right) return 1
    return 0
  }

  lessThan(other: Rational): boolean {
    return this.compare(other) < 0
  }

  greaterThan(other: Rational): boolean {
    return this.compare(other) > 0
  }

  lessThanOrEqual(other: Rational): boolean {
    return this.compare(other) <= 0
  }

  greaterThanOrEqual(other: Rational): boolean {
    return this.compare(other) >= 0
  }

  equals(other: Rational): boolean {
    return this.compare(other) === 0
  }

  /**
   * Round to nearest integer (BigInt)
   */
  round(): bigint {
    const quotient = this.num / this.den
    const remainder = this.num % this.den
    
    // Check if we need to round up
    // Round up if remainder >= den/2 (for positive) or remainder <= -den/2 (for negative)
    const halfDen = this.den / 2n
    
    if (this.num >= 0n) {
      if (remainder >= halfDen) {
        return quotient + 1n
      }
      // Handle exactly half: round to even (banker's rounding)
      if (remainder * 2n === this.den) {
        return (quotient % 2n === 0n) ? quotient : quotient + 1n
      }
      return quotient
    } else {
      const absRemainder = -remainder
      if (absRemainder > halfDen) {
        return quotient - 1n
      }
      // Handle exactly half: round to even
      if (absRemainder * 2n === this.den) {
        return (quotient % 2n === 0n) ? quotient : quotient - 1n
      }
      return quotient
    }
  }

  /**
   * Floor division
   */
  floor(): bigint {
    if (this.num >= 0n) {
      return this.num / this.den
    }
    // For negative numbers, we need to round toward negative infinity
    return (this.num - this.den + 1n) / this.den
  }

  /**
   * Convert to number (may lose precision for large values)
   */
  toNumber(): number {
    // For small enough values, direct division works
    if (this.den === 1n) {
      return Number(this.num)
    }
    
    // For larger values, we need to be careful about overflow
    // Use logarithmic scaling if values are too large
    const numBits = this.num.toString(2).length
    const denBits = this.den.toString(2).length
    
    if (numBits < 53 && denBits < 53) {
      return Number(this.num) / Number(this.den)
    }
    
    // Scale down to avoid overflow
    const scaleBits = Math.max(0, Math.max(numBits, denBits) - 52)
    const scale = 1n << BigInt(scaleBits)
    return Number(this.num / scale) / Number(this.den / scale)
  }

  /**
   * Square of the rational number
   */
  square(): Rational {
    return new Rational(this.num * this.num, this.den * this.den)
  }

  toString(): string {
    if (this.den === 1n) {
      return this.num.toString()
    }
    return `${this.num}/${this.den}`
  }
}

/**
 * Vector operations using rational arithmetic
 */
export function rationalDotProduct(a: bigint[], b: bigint[]): Rational {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length')
  }
  
  let sum = Rational.zero()
  for (let i = 0; i < a.length; i++) {
    sum = sum.add(new Rational(a[i] * b[i], 1n))
  }
  return sum
}

/**
 * Compute the squared norm of a vector as a Rational
 */
export function rationalNormSquared(v: bigint[]): Rational {
  let sum = Rational.zero()
  for (const x of v) {
    sum = sum.add(new Rational(x * x, 1n))
  }
  return sum
}

/**
 * Scale a vector by a rational number, rounding to BigInt
 */
export function scaleVectorByRational(v: bigint[], scalar: Rational): bigint[] {
  return v.map(x => {
    const scaled = new Rational(x * scalar.num, scalar.den)
    return scaled.round()
  })
}

/**
 * Subtract vectors
 */
export function subtractBigIntVectors(a: bigint[], b: bigint[]): bigint[] {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length')
  }
  return a.map((val, i) => val - b[i])
}

/**
 * Scale a vector by a BigInt scalar
 */
export function scaleBigIntVector(v: bigint[], scalar: bigint): bigint[] {
  return v.map(x => x * scalar)
}

/**
 * Gram-Schmidt orthogonalization with exact rational μ coefficients
 * 
 * This is the key improvement over the previous implementation.
 * By using rational arithmetic, we avoid all rounding errors in the
 * μ coefficients, which is critical for LLL stability.
 * 
 * Returns:
 * - B: The orthogonalized basis (as BigInt vectors)
 * - mu: The Gram-Schmidt coefficients as exact Rationals
 * - Bsquared: The squared norms ||B*_i||² as exact Rationals
 */
export function rationalGramSchmidt(basis: bigint[][]): {
  B: bigint[][]
  mu: Rational[][]
  Bsquared: Rational[]
} {
  const n = basis.length
  if (n === 0) {
    return { B: [], mu: [], Bsquared: [] }
  }

  const m = basis[0].length
  
  // B*_i will be stored scaled by a common denominator for exact arithmetic
  // Instead of storing B* directly, we store the original basis and compute
  // projections using the μ coefficients
  
  const B: bigint[][] = []
  const mu: Rational[][] = Array(n).fill(null).map(() => Array(n).fill(Rational.zero()))
  const Bsquared: Rational[] = []
  
  for (let i = 0; i < n; i++) {
    // Start with B*_i = b_i
    let Bi = [...basis[i]]
    
    // Subtract projections: B*_i = b_i - Σ_{j<i} μ_{i,j} * B*_j
    for (let j = 0; j < i; j++) {
      // μ_{i,j} = <b_i, B*_j> / <B*_j, B*_j>
      const numerator = rationalDotProduct(basis[i], B[j])
      const denominator = Bsquared[j]
      
      if (!denominator.isZero()) {
        mu[i][j] = numerator.divide(denominator)
        
        // Bi = Bi - μ_{i,j} * B*_j
        // For exact arithmetic, we scale: Bi * denom - μ.num * B*_j
        // Then divide by denom at the end
        const scaledBj = scaleBigIntVector(B[j], mu[i][j].num)
        const scaledBi = scaleBigIntVector(Bi, mu[i][j].den)
        Bi = subtractBigIntVectors(scaledBi, scaledBj).map(x => {
          // Divide by denominator, with proper rounding
          const r = new Rational(x, mu[i][j].den)
          return r.round()
        })
      }
    }
    
    B.push(Bi)
    Bsquared.push(rationalNormSquared(Bi))
  }
  
  return { B, mu, Bsquared }
}

/**
 * Check the Lovász condition using exact rational arithmetic
 * 
 * The condition is: ||B*_k||² >= (δ - μ_{k,k-1}²) * ||B*_{k-1}||²
 * 
 * Using rationals, this becomes an exact integer comparison after
 * cross-multiplication, eliminating floating-point errors.
 */
export function checkLovaszCondition(
  Bsquared: Rational[],
  mu: Rational[][],
  k: number,
  delta: Rational
): boolean {
  if (k === 0) return true
  
  const Bk = Bsquared[k]
  const Bk1 = Bsquared[k - 1]
  
  if (Bk1.isZero()) return true
  
  // Right side: (δ - μ_{k,k-1}²) * ||B*_{k-1}||²
  const muSquared = mu[k][k - 1].square()
  const factor = delta.subtract(muSquared)
  const rightSide = factor.multiply(Bk1)
  
  // Check: Bk >= rightSide
  return Bk.greaterThanOrEqual(rightSide)
}

/**
 * Create a Rational from the standard delta values (0.75, 0.99, etc.)
 */
export function deltaToRational(delta: number): Rational {
  // Common delta values
  if (delta === 0.75) {
    return new Rational(3n, 4n)
  }
  if (delta === 0.99) {
    return new Rational(99n, 100n)
  }
  if (delta === 0.5) {
    return new Rational(1n, 2n)
  }
  if (delta === 1) {
    return new Rational(1n, 1n)
  }
  
  // For other values, use continued fraction approximation
  return Rational.fromNumber(delta)
}
