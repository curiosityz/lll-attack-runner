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

## Future Enhancements

Potential improvements:
1. WebAssembly acceleration for BigInt operations
2. Parallel processing for large matrices
3. Caching of intermediate results
4. Support for other elliptic curves (P-256, Ed25519)
5. Hardware acceleration via Web Crypto API where possible
