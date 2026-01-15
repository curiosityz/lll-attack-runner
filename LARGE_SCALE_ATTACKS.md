# Lattice Attack Suite - Large-Scale Attack Configuration

## Overview
The Lattice Attack Suite now supports **40-50 signature attacks** for breaking 256-bit ECDSA keys with small bias (2-4 bits of nonce leakage).

## Dimension Scaling

### Previous Configuration
- **4x4 matrices** (~3 signatures)
- Limited to simple nonce reuse attacks
- Insufficient for breaking keys with small bias

### Current Configuration
- **40x40 to 50x50 matrices** (40-50 signatures)
- Full 256-bit key recovery with minimal bias
- Three lattice construction types for optimal performance

## Why 40-50 Signatures?

### Mathematical Foundation
Breaking a 256-bit ECDSA private key with the Hidden Number Problem (HNP) requires:
- **Formula**: `n ≈ 256 / k` signatures, where `k` is the number of known/biased bits
- **2-bit bias**: ~128 signatures (theoretical minimum)
- **4-bit bias**: ~64 signatures (theoretical minimum)
- **Practical range**: 40-50 signatures with 2-4 bit bias provides high success probability

### Real-World Considerations
1. **Noise tolerance**: Real-world signatures have measurement noise
2. **LLL approximation**: The LLL algorithm is polynomial-time approximate, not exact
3. **Safety margin**: Using 40-50 signatures (instead of theoretical minimum) ensures:
   - Robustness against noise
   - Higher success probability
   - Redundancy in case some signatures are outliers

## Attack Types & Dimensions

### 1. Nonce Reuse Attacks
- **Dimension**: Up to 40x40
- **Signatures**: 40 signatures sharing nonces
- **Algorithm**: BKZ with block size 20-30
- **Success rate**: 100% when truly reused

### 2. Biased Nonce Attacks (HNP)
- **Dimension**: 50x50 (standard), 100x100 (embedded)
- **Signatures**: 50 signatures with biased nonces
- **Algorithm**: BKZ with block size 20-30
- **Lattice types**:
  - **Standard**: Direct HNP lattice (< 20 signatures)
  - **Kannan Embedding**: Enhanced CVP reduction (20-35 signatures)
  - **Embedded**: Full embedding for maximum precision (35-50 signatures)

### 3. Sequential Nonce Attacks
- **Dimension**: Up to 45x45
- **Signatures**: 45 signatures with predictable nonces
- **Algorithm**: BKZ with block size 20-25
- **Use case**: Weak RNG with sequential or arithmetic patterns

## Lattice Construction Strategies

### Standard HNP Lattice
```
[r₁  B  0  0  ... 0]
[r₂  0  B  0  ... 0]
[r₃  0  0  B  ... 0]
...
[rₙ  0  0  0  ... B]
[N   0  0  0  ... 0]
```
- Best for: < 20 signatures
- Complexity: O(n³)
- Block size: 10-15

### Kannan Embedding
```
[r₁  s₁  B  0  ... 0]
[r₂  s₂  0  B  ... 0]
...
[rₙ  sₙ  0  0  ... B]
[N   0   0  0  ... 0]
[0   M   0  0  ... 0]
```
- Best for: 20-35 signatures
- Complexity: O(n³)
- Block size: 18-25

### Embedded Lattice
```
[r₁  B  0  ... h₁  0  ... 0]
[r₂  0  B  ... h₂  0  ... 0]
...
[rₙ  0  0  ... hₙ  0  ... 0]
[0   0  0  ... N   0  ... 0]
...
[0   0  0  ... 0   N  ... 0]
[2N  0  0  ... 0   0  ... 0]
```
- Best for: 35-50 signatures
- Complexity: O((2n)³)
- Block size: 20-30
- Higher dimension but better numerical stability

## Performance Considerations

### Computation Time
| Matrix Size | Expected Time | Success Probability |
|------------|---------------|-------------------|
| 10x10      | < 1s         | Low (insufficient data) |
| 20x20      | 1-5s         | Medium |
| 30x30      | 5-15s        | High |
| 40x40      | 10-30s       | Very High |
| 50x50      | 20-60s       | Near-certain |

### Algorithm Selection
- **LLL**: Faster (polynomial time), good for small matrices (< 20x20)
- **BKZ**: Slower but stronger reduction, required for large matrices (> 30x30)
  - Block size 20-25: Balanced speed/quality
  - Block size 25-30: Maximum quality, slower

## High-Precision Arithmetic

The system now uses **BigInt precision mode** by default:
- Full secp256k1 values (256-bit integers)
- No floating-point precision loss
- Automatic scaling when values exceed safe integer range
- Essential for 40-50 signature attacks

## UI Indicators

### Large-Scale Attack Badge
When 30+ signatures are configured:
- **Blue badge**: "Large-scale (N sigs)" appears
- **Matrix dimensions**: Shows NxN size
- **Estimated time**: Displays expected computation time

### Pattern Clusters
Patterns with 40+ signatures show:
- **"40-50 sig attack ready"** badge
- Optimal lattice type recommendation
- Estimated complexity level

## Best Practices

1. **Start with analysis**: Upload data → Analyze → Review patterns
2. **Check signature count**: Look for patterns with 40+ signatures
3. **Use recommended attacks**: System auto-selects optimal lattice type
4. **Enable high-precision**: Keep BigInt mode enabled for accuracy
5. **Allow computation time**: 40-50 sig attacks may take 30-60 seconds
6. **Disable visualization**: Turn off step capture for large attacks (speeds up by 2-3x)

## Success Indicators

After running a 40-50 signature attack:
- **Reduced basis**: First vector should be significantly shorter than others
- **Solution vector**: Should have small integer coefficients
- **Private key**: System attempts automatic extraction and validation
- **Derived address**: Compares against original to verify success

## Troubleshooting

### "Random noise" instead of exact key
- **Cause**: Insufficient signatures or bias too small
- **Solution**: Increase to 50 signatures or verify bias exists

### Attack takes too long (> 2 minutes)
- **Cause**: Matrix too large or block size too high
- **Solution**: Reduce block size to 20-22, disable visualization

### Key extraction fails
- **Cause**: Lattice found a vector but it's not the correct key
- **Solution**: Try different lattice type (Standard → Kannan → Embedded)

## Technical References

- **LLL Algorithm**: Lenstra-Lenstra-Lovász lattice basis reduction
- **BKZ Algorithm**: Block Korkine-Zolotarev, stronger reduction
- **HNP**: Hidden Number Problem, basis of ECDSA nonce attacks
- **secp256k1**: Bitcoin/Ethereum elliptic curve (256-bit)
