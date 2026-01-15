# Lattice Dimension Requirements & The Saturation Effect

## Critical Understanding: Why Small Lattices Fail

### The Problem
When attacking cryptographic signatures to extract private keys, **lattice dimension is the most critical factor**. This document explains why 4×4 or even 10×10 matrices cannot extract keys, and what dimensions are actually required.

## The Information Theory Barrier

### Target vs. Input
- **Secret to find**: 256-bit private key (secp256k1 ECDSA)
- **Your input with N signatures**: N equations
- **The gap**: N << 256 means insufficient information to uniquely identify the key

### Example: 4×4 Lattice (3 signatures)
```
Matrix Dimension: 4×4
Signatures: 3
Equations: 3
Unknown bits: 256

Result: The algorithm finds random coincidences (noise) where numbers 
happen to cancel out, NOT the actual private key.
```

## The Saturation Effect

### What It Means
When your **Block Size ≥ Matrix Dimension**, BKZ performs a complete SVP (Shortest Vector Problem) search. This finds the absolute shortest vector possible in that lattice.

### Example
```
Matrix: 4×4
Block Size: 20 → Saturated (20 ≥ 4)
Block Size: 30 → Saturated (30 ≥ 4)

Result: Both produce IDENTICAL output because the algorithm has 
already exhausted all possibilities in a 4-dimensional space.
```

### Why Index[0] = 0 is Bad
In HNP lattices:
- **Index[0]** should contain the coefficient related to the private key
- **Index[0] = 0** means the algorithm ignored your target (the modulus/secret column)
- It found a "spurious solution" - a random linear combination in other columns

This is like finding that 2 + 3 = 5 instead of finding the password to a safe.

## Required Dimensions for Success

### Information Theory Requirements

| Signatures | Dimension | Success Rate | Explanation |
|-----------|-----------|--------------|-------------|
| 1-9 | 2-10D | 0% | Mathematically impossible - too few equations |
| 10-19 | 11-20D | <5% | Marginal - mostly finds noise |
| 20-39 | 21-40D | 10-30% | Possible but unreliable |
| **40-59** | **41-60D** | **60-90%** | **Good - recommended minimum** |
| **60-79** | **61-80D** | **90-99%** | **Excellent - high reliability** |
| 80+ | 81D+ | 99%+ | Overkill but guaranteed |

### Why 40+ Signatures?

With 40 signatures:
1. **Real Secret Vector**: Remains short (~256 bits worth of information)
2. **Spurious Vectors**: Grow exponentially longer (noise spreads across 40+ dimensions)
3. **Algorithm**: Can now distinguish the unique short vector (the key) from noise

## Implementation in This Tool

### Automatic Dimension Optimization

The tool now:
1. **Checks signature count** before building lattices
2. **Warns users** when dimension < 40
3. **Uses all available signatures** (up to 80) when building HNP lattices
4. **Selects optimal lattice type** based on dimension:
   - Standard HNP: 10-20 signatures
   - Kannan Embedding: 20-40 signatures  
   - Embedded HNP: 40+ signatures

### Enhanced Lattice Builders

```typescript
buildHNPLattice()
- Target: 40-80 signatures
- Output: (N+1) × (N+1) lattice
- Use case: Standard biased-k attacks

buildEmbeddedHNPLattice()
- Target: 35-60 signatures
- Output: (2N+1) × (2N+1) lattice
- Use case: Complex bias patterns

buildKannanEmbeddingLattice()
- Target: 40-70 signatures
- Output: (N+2) × (N+2) lattice
- Use case: Medium-sized high-quality attacks
```

## User Guidance Components

### 1. SignatureRequirementInfo
Displays on Upload/Analyze tabs:
- Current signature count vs. requirement (40+)
- Progress bar showing dimension adequacy
- Mathematical explanation of why dimension matters
- Clear thresholds: <10 (insufficient), 10-39 (marginal), 40+ (excellent)

### 2. DimensionGuidance
Displays in Attack tab before execution:
- Real-time dimension assessment based on current matrix
- Color-coded warnings (red/yellow/green)
- Specific advice on how many more signatures needed
- Technical explanation of the information gap

### 3. SaturationWarning
Displays after attack completes:
- Detects when Block Size ≥ Dimension (saturation)
- Explains why Index[0] = 0 indicates spurious solution
- Shows information theory gap (256 bits vs. N equations)
- Provides clear solution: upload 40-80 signatures

## Practical Workflow

### Before (Old Behavior)
```
User uploads 3 signatures
↓
Tool builds 4×4 lattice
↓
BKZ runs with block size 20
↓
Finds spurious solution [0, ...]
↓
User confused - "attack succeeded" but no key
```

### After (New Behavior)
```
User uploads 3 signatures
↓
Tool warns: "Insufficient data - need 40+ signatures"
↓
Shows dimension guidance: "4D lattice - will find noise only"
↓
If user proceeds anyway:
  ↓
  Attack completes
  ↓
  Saturation warning: "Block Size (20) ≥ Dimension (4)"
  ↓
  Explanation: "This is noise, not the key. Upload more data."
```

### Optimal Workflow
```
User uploads 50+ signatures
↓
Tool: "Excellent! 51×51 lattice - high success probability"
↓
Builds high-dimensional HNP lattice
↓
BKZ runs with appropriate block size (20-25)
↓
Finds real short vector with non-zero Index[0]
↓
Extracts and validates private key
↓
Success: Key recovered and verified
```

## Technical Details

### HNP Lattice Construction (40+ signatures)

```
For N signatures with biased nonces:

Standard lattice (N+1) × (N+1):
[r₁ mod n, B,   0,   0,  ..., 0  ]
[r₂ mod n, 0,   B,   0,  ..., 0  ]
[r₃ mod n, 0,   0,   B,  ..., 0  ]
...
[rₙ mod n, 0,   0,   0,  ..., B  ]
[n,        0,   0,   0,  ..., 0  ]

Where:
- rᵢ are signature r-values
- B = √n / 2^(known_bits) is the bound
- n is secp256k1 order

With 40 rows, the real key creates a short vector.
Noise vectors are ~40× longer and eliminated by BKZ.
```

### Block Size Selection

```typescript
// Dimension-aware block size
if (dimension >= 60) {
  blockSize = Math.min(30, Math.ceil(dimension / 3))
} else if (dimension >= 40) {
  blockSize = Math.min(25, Math.ceil(dimension / 3))
} else if (dimension >= 20) {
  blockSize = Math.min(20, Math.ceil(dimension / 2))
} else {
  blockSize = 10  // Small dimension - won't help anyway
}
```

## Key Takeaways

1. **Dimension = Information**: More signatures = higher dimension = more information to isolate the key
2. **40 is the Magic Number**: Below this, you're fighting information theory. Above it, you're working with it.
3. **Saturation = Limit Reached**: When block size ≥ dimension, you've found the best possible vector in that space (but the space itself is too small)
4. **Index[0] = 0 is a Red Flag**: Means you found coincidental noise, not the cryptographic secret
5. **The Fix is Always the Same**: Upload transaction data with 40-80 signatures from the same address

## References

- Hidden Number Problem (HNP): Finding secret from partial information
- Information Theory: Shannon entropy and unique solution requirements
- Lattice Basis Reduction: LLL and BKZ algorithms for finding short vectors
- secp256k1: The elliptic curve used in Bitcoin/Ethereum (256-bit keys)
