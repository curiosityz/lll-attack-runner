# Signature Batch Analysis Feature

## Overview
Implemented comprehensive signature batch analysis to detect cryptographic patterns across multiple blockchain transactions.

## New Components

### 1. Batch Analysis Engine (`src/lib/batch-analysis.ts`)
Advanced pattern detection across multiple signatures:

**Pattern Detection:**
- **Nonce Reuse Clusters**: Detects when the same r-value appears in multiple signatures
- **Sequential Nonces**: Identifies predictable progression of k-values
- **Biased LSB/MSB**: Statistical analysis of bit patterns in nonces
- **Temporal Correlation**: Detects time-based patterns in nonce generation
- **Address Clustering**: Identifies high-activity addresses with low entropy
- **Cross-Address Correlation**: Finds similar r-values across different addresses

**Statistical Analysis:**
- Entropy calculation for r and s values
- Bit bias detection (LSB and MSB)
- Cross-address correlation detection
- Significance scoring for all patterns

**Attack Generation:**
- Automatically constructs optimal lattice bases for detected patterns
- Intelligently selects between LLL and BKZ algorithms
- Calculates appropriate block sizes for BKZ based on pattern complexity
- Provides detailed attack descriptions and confidence scores

### 2. Batch Analysis Display (`src/components/BatchAnalysisDisplay.tsx`)
Interactive UI for viewing analysis results:

**Three Main Tabs:**
- **Clusters**: Shows detected pattern clusters with metadata and confidence scores
- **Patterns**: Displays statistical patterns with significance metrics
- **Recommendations**: Provides actionable attack strategies based on findings

**Features:**
- Color-coded severity indicators (Critical, High, Medium, Low)
- Detailed metadata views for each cluster
- One-click attack generation from any cluster
- Statistical significance visualization
- Summary statistics dashboard

### 3. Enhanced RPC Scanner (`src/components/RPCScanner.tsx`)
Updated scanner with batch analysis integration:

**New Features:**
- Collects all signatures (not just weak ones) for comprehensive analysis
- "Run Batch Analysis" button triggers pattern detection
- Two-tab interface: Individual Signatures vs Batch Analysis
- Seamless integration with attack generation workflow

## User Workflow

1. **Scan Blockchain**: User scans a range of blocks using RPC endpoint
2. **View Individual Results**: See weak signatures detected by traditional methods
3. **Run Batch Analysis**: Click to analyze all signatures for cross-transaction patterns
4. **Review Patterns**: Examine clusters, statistical patterns, and recommendations
5. **Generate Attacks**: Click on any cluster to auto-generate optimal lattice attack
6. **Execute Attack**: Automatically switches to Attack tab with configuration loaded

## Technical Highlights

### Pattern Detection Algorithms
- Sliding window comparison for sequential patterns
- Statistical entropy calculation using frequency bucketing
- Bit-level bias detection with configurable thresholds
- Temporal correlation using timestamp analysis
- Address-based clustering with entropy filtering

### Attack Configuration Intelligence
- Nonce reuse → LLL with direct recovery lattice
- Sequential/biased patterns → BKZ with HNP lattice (block size 10-15)
- Correlation patterns → BKZ with correlation lattice (block size 12)
- Automatic scaling and normalization for numerical stability

### Performance Optimizations
- Efficient signature grouping by address and r-value
- Limited comparison windows for O(n²) operations
- Early termination for low-confidence patterns
- Cached statistical calculations

## Security Analysis Capabilities

The batch analysis can detect:
- **Implementation Flaws**: Weak RNGs, deterministic nonces, counter-based nonces
- **Side-Channel Leakage**: Timing-based patterns, cache-based patterns
- **Multi-Transaction Attacks**: Cross-signature correlation, address linkage
- **Statistical Weaknesses**: Entropy reduction, bit bias, periodic patterns

## Example Scenarios

### Scenario 1: Nonce Reuse Attack
```
Found: 3 signatures with same r-value
Cluster: nonce-reuse (Critical, 100% confidence)
Attack: 4x4 lattice with direct key recovery
Algorithm: LLL (δ=0.99)
```

### Scenario 2: Sequential Nonce Attack
```
Found: 8 signatures with sequential r-values from same address
Cluster: sequential-nonce (High, 87% confidence)
Attack: 10x10 HNP lattice
Algorithm: BKZ (block size 15)
```

### Scenario 3: Biased LSB Attack
```
Found: 15 signatures showing 34% LSB bias
Cluster: biased-lsb (High, 68% confidence)
Attack: 10x10 HNP lattice with bias exploitation
Algorithm: BKZ (block size 12)
```

## Future Enhancements
- Export analysis results as JSON reports
- Time-series visualization of patterns
- Machine learning-based pattern prediction
- Custom pattern definition framework
- Real-time streaming analysis
