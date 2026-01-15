# Multi-Precision Arithmetic Library

This library provides high-precision arithmetic operations for handling full secp256k1 cryptographic values in JavaScript without precision loss.

## Overview

JavaScript's native `Number` type uses 64-bit floating-point (IEEE 754), which can only safely represent integers up to 2^53 - 1 (≈9 × 10^15). Since secp256k1 operations involve 256-bit integers (≈10^77), standard JavaScript arithmetic would lose precision.

This library solves this problem by:
1. Using JavaScript's native `BigInt` for arbitrary-precision integer arithmetic
2. Implementing elliptic curve operations over secp256k1
3. Providing lattice reduction algorithms that work with full-precision values
4. Automatically detecting when high precision is needed and switching modes

## Core Components

### 1. `bigint-math.ts` - Multi-Precision Arithmetic

Provides fundamental cryptographic and mathematical operations:

#### Elliptic Curve Operations
- `pointMultiply(k, x, y)` - Scalar multiplication on secp256k1
- `pointAdd(x1, y1, x2, y2)` - Point addition
- `pointDouble(x, y)` - Point doubling
- `isPointOnCurve(x, y)` - Curve validation

#### Modular Arithmetic
- `modInverse(a, m)` - Modular multiplicative inverse
- `modPow(base, exp, mod)` - Modular exponentiation
- `modSqrt(n, p)` - Modular square root (Tonelli-Shanks)
- `mod(n, m)` - Proper modulo (handles negatives)

#### Vector Operations
- `dotProduct(a, b)` - Dot product of two vectors
- `vectorNorm(v)` - Euclidean norm
- `gramSchmidt(basis)` - Gram-Schmidt orthogonalization
- `scaleVector(v, scalar)` - Scalar multiplication
- `addVectors(a, b)` / `subtractVectors(a, b)` - Vector arithmetic

#### Cryptographic Key Recovery
- `recoverPublicKeyFromSignature(r, s, z, recoveryId)` - ECDSA public key recovery
- `derivePrivateKeyFromNonceReuse(r, s1, s2, z1, z2)` - Nonce reuse attack
- `verifyPrivateKey(privateKey, publicKey)` - Key validation

#### Utility Functions
- `bigintAbs(n)` - Absolute value
- `bigintMin(...values)` / `bigintMax(...values)` - Min/max
- `sqrt(n)` - Integer square root
- `gcd(a, b)` / `extendedGCD(a, b)` - GCD operations

### 2. `bigint-lll.ts` - High-Precision Lattice Reduction

Implements LLL and BKZ algorithms using BigInt arithmetic:

#### Algorithms
- `runBigIntLLL(basis, delta, maxIterations)` - Full-precision LLL
- `runBigIntBKZ(basis, blockSize, delta, maxIterations)` - Full-precision BKZ

#### Lattice Builders
- `buildHNPLattice(signatures, n, bitsBiased)` - Hidden Number Problem lattice
- `buildNonceReuseLattice(sig1, sig2, n)` - Nonce reuse attack lattice

### 3. `precision-wrapper.ts` - Automatic Precision Management

Intelligently chooses between standard and high-precision arithmetic:

#### Automatic Mode Selection
```typescript
function needsHighPrecision(basis: number[][]): boolean
```
Detects if values exceed JavaScript's safe integer range.

#### Unified Interface
- `runPrecisionLLL(basis, delta, captureVisualization)` - Auto-selects LLL mode
- `runPrecisionBKZ(basis, blockSize, delta, captureVisualization)` - Auto-selects BKZ mode

Both return:
```typescript
{
  reducedBasis: number[][]
  success: boolean
  iterations: number
  solutionVector?: number[]
  usedHighPrecision: boolean  // Indicates which mode was used
  originalScale?: bigint      // Scale factor if applicable
}
```

## Usage Examples

### Example 1: Basic Elliptic Curve Operations

```typescript
import { 
  pointMultiply, 
  SECP256K1_GX, 
  SECP256K1_GY,
  privateKeyToHex 
} from '@/lib/bigint-math'

// Generate a public key from a private key
const privateKey = BigInt('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
const publicKey = pointMultiply(privateKey, SECP256K1_GX, SECP256K1_GY)

console.log('Public Key:', publicKey)
console.log('Private Key (hex):', privateKeyToHex(privateKey))
```

### Example 2: Nonce Reuse Attack

```typescript
import { derivePrivateKeyFromNonceReuse } from '@/lib/bigint-math'

// Two signatures with the same nonce k
const r = BigInt('0x...')
const s1 = BigInt('0x...')
const s2 = BigInt('0x...')
const z1 = BigInt('0x...') // message hash 1
const z2 = BigInt('0x...') // message hash 2

const privateKey = derivePrivateKeyFromNonceReuse(r, s1, s2, z1, z2)

if (privateKey) {
  console.log('Private key recovered:', privateKeyToHex(privateKey))
}
```

### Example 3: High-Precision Lattice Attack

```typescript
import { runPrecisionBKZ } from '@/lib/precision-wrapper'

// Large secp256k1 values that would overflow Number type
const basis = [
  [BigInt('0x...'), BigInt('0x...'), BigInt('0x...')],
  [BigInt('0x...'), BigInt('0x...'), BigInt('0x...')],
  [BigInt('0x...'), BigInt('0x...'), BigInt('0x...')]
].map(row => row.map(v => Number(v))) // Convert for interface

const result = runPrecisionBKZ(basis, 20, 0.99, false)

if (result.usedHighPrecision) {
  console.log('High-precision mode was automatically used')
}

console.log('Reduced basis:', result.reducedBasis)
console.log('Shortest vector:', result.solutionVector)
```

### Example 4: Building HNP Lattice

```typescript
import { buildPrecisionHNPLattice } from '@/lib/precision-wrapper'

const signatures = [
  { r: BigInt('0x...'), s: BigInt('0x...'), z: BigInt('0x...') },
  { r: BigInt('0x...'), s: BigInt('0x...'), z: BigInt('0x...') },
  { r: BigInt('0x...'), s: BigInt('0x...'), z: BigInt('0x...') }
]

const lattice = buildPrecisionHNPLattice(signatures, 8) // 8 biased bits
```

## Architecture

```
User Input (Matrix with secp256k1 values)
           ↓
    precision-wrapper.ts
    (Detects precision needs)
           ↓
    ┌──────┴──────┐
    ↓             ↓
Standard Mode   High-Precision Mode
(lll.ts)        (bigint-lll.ts)
(bkz.ts)        uses bigint-math.ts
    ↓             ↓
    └──────┬──────┘
           ↓
    Results with precision indicator
```

## Performance Considerations

### Standard Mode (Float64)
- **Speed**: Very fast (~2ms for 3×3 matrix)
- **Range**: ±2^53 (±9 × 10^15)
- **Best for**: Small matrices, pre-scaled values

### High-Precision Mode (BigInt)
- **Speed**: Slower (~10-50ms for 3×3 matrix)
- **Range**: Unlimited
- **Best for**: Full secp256k1 values, cryptographic operations

The system automatically chooses the appropriate mode based on value sizes.

## Constants

### secp256k1 Curve Parameters
```typescript
SECP256K1_N  // Order of the curve (prime)
SECP256K1_P  // Field prime
SECP256K1_GX // Generator point X coordinate
SECP256K1_GY // Generator point Y coordinate
```

## Error Handling

All functions that can fail return `null` or throw meaningful errors:

```typescript
try {
  const inverse = modInverse(0n, 7n) // Will throw
} catch (e) {
  console.error('No modular inverse exists')
}

const publicKey = recoverPublicKeyFromSignature(r, s, z, 0)
if (publicKey === null) {
  console.error('Could not recover public key')
}
```

## Testing

The library handles edge cases:
- Zero values
- Negative numbers (proper modulo)
- Very large numbers (256-bit integers)
- Invalid curve points
- Non-invertible elements

## Integration with UI

The `PrecisionIndicator` component shows users which arithmetic mode was used:

```tsx
<PrecisionIndicator 
  usedHighPrecision={result.usedHighPrecision}
  originalScale={result.originalScale}
  matrixSize={{ rows: 3, cols: 3 }}
/>
```

The `PrecisionWarning` component alerts users when values approach precision limits:

```tsx
<PrecisionWarning values={matrixValues.flat()} />
```

## Rational Arithmetic for High-Precision Lattice Reduction

The library now includes exact rational arithmetic for LLL/BKZ computations, inspired by established libraries like fpylll and SageMath:

### Key Features

1. **Exact Gram-Schmidt Coefficients**: The μ coefficients are computed using rational numbers (numerator/denominator pairs), eliminating floating-point rounding errors.

2. **Exact Lovász Condition**: The condition `||B*_k||² ≥ (δ - μ_{k,k-1}²) * ||B*_{k-1}||²` is checked using exact rational comparison.

3. **Proper Size Reduction**: Rounding to integers uses banker's rounding (round half to even) for optimal numerical behavior.

### Implementation Files

- `rational.ts` - Rational number class with exact arithmetic operations
- `high-precision-lll.ts` - LLL and BKZ algorithms using rational arithmetic

### When Rational Arithmetic is Used

The `precision-wrapper.ts` automatically selects the appropriate algorithm:
- Small values (within JavaScript's safe integer range): Standard floating-point LLL
- Large values (cryptographic size): High-precision rational arithmetic LLL

## External Tools for Production Use

For production-critical cryptographic research, consider using these established libraries:

### fpylll / fplll

The [fplll library](https://github.com/fplll/fplll) is the gold standard for lattice reduction:

```bash
# Install fpylll (Python wrapper for fplll)
pip install fpylll

# Python usage example
from fpylll import IntegerMatrix, LLL, BKZ

# Create matrix
A = IntegerMatrix.from_matrix([[...], [...], ...])

# LLL reduction
LLL.reduction(A)

# BKZ reduction with block size 20
BKZ.reduction(A, BKZ.Param(block_size=20))
```

### SageMath

[SageMath](https://www.sagemath.org/) provides comprehensive lattice tools:

```python
# SageMath usage
from sage.all import *

# Create matrix
M = matrix(ZZ, [[...], [...], ...])

# LLL reduction
L = M.LLL()

# BKZ reduction
B = M.BKZ(block_size=20)

# For HNP attacks
from sage.modules.free_module_integer import IntegerLattice
lattice = IntegerLattice(M)
short_vectors = lattice.shortest_vectors()
```

### Why Use External Tools?

1. **Performance**: fplll is written in C++ with extensive optimizations
2. **Algorithms**: Support for BKZ 2.0, slide reduction, and other advanced methods
3. **Testing**: Decades of testing in cryptographic research
4. **Precision**: Multi-precision floating-point (MPFR) for extreme precision

### Integration Pattern

For browser-based applications, use a server-side component:

```typescript
// Frontend: Send lattice to server
const response = await fetch('/api/reduce', {
  method: 'POST',
  body: JSON.stringify({ basis: lattice, algorithm: 'bkz', blockSize: 20 })
})
const result = await response.json()

// Server (Python/SageMath):
# from flask import Flask, request
# import fpylll
# ...
```

## Future Enhancements

Potential improvements:
1. WebAssembly acceleration for BigInt operations
2. Parallel processing for large matrices
3. Caching of intermediate results
4. Support for other elliptic curves (P-256, Ed25519)
5. Hardware acceleration via Web Crypto API where possible
6. WebAssembly port of fplll for in-browser high-performance reduction
7. Integration with lattice estimator for security analysis
