# Advanced LLL/BKZ Attack Runner with ML Pattern Prediction

An interactive web application for running advanced lattice basis reduction attacks (LLL, BKZ) on cryptographic problems, featuring RPC blockchain signature scanning, automated attack generation, batch pattern analysis, **machine learning-based vulnerability prediction**, and educational visualizations.

## 🚀 Key Features

### Lattice Basis Reduction
- **LLL Algorithm**: Fast polynomial-time lattice reduction
- **BKZ Algorithm**: Block Korkine-Zolotarev for stronger reduction with configurable block sizes
- **40+ Attack Templates**: Pre-configured scenarios across RSA, Subset Sum, Knapsack, CVP, HNP, NTRU, DSA, and custom attacks
- **Interactive Visualizations**: D3-powered animations showing vector transformations during reduction

### RPC Signature Scanner
- **Blockchain Integration**: Connect to Ethereum-compatible RPC nodes
- **Vulnerability Detection**: Automatically identify weak ECDSA/DSA signatures
  - Nonce reuse (critical)
  - Biased k-values (high)
  - Sequential nonces (high)
  - Small r-values (critical)
  - Temporal correlations
- **Automated Attack Generation**: Convert detected vulnerabilities into lattice configurations

### Batch Pattern Analysis
- **Cross-Transaction Analysis**: Detect patterns across multiple signatures
- **Pattern Clusters**: Identify nonce reuse clusters, sequential patterns, bit bias, and address clustering
- **Statistical Analysis**: Entropy reduction, temporal correlation, and cross-address correlation detection
- **Smart Attack Generation**: Automatically select LLL or BKZ with optimal parameters

### 🧠 ML Pattern Prediction (NEW!)
- **Predictive Analytics**: Machine learning system that forecasts vulnerable blocks in unscanned ranges
- **Feature Extraction**: Analyzes temporal patterns, address behavior, volume anomalies, and cluster proximity
- **AI Enhancement**: Optional GPT-4o-mini integration for improved predictions and reasoning
- **Priority Scoring**: Confidence-based ranking (Critical/High/Medium/Low) with reasoning
- **Smart Scanning**: Identifies high-priority blocks to optimize scanning efforts
- **Vulnerability Forecasting**: Predicts specific vulnerability types (nonce reuse, sequential nonces, biased k-values, etc.)

## 📚 Documentation

- **[PRD.md](PRD.md)**: Product requirements and feature specifications
- **[BATCH_ANALYSIS.md](BATCH_ANALYSIS.md)**: Detailed batch analysis documentation
- **[ML_PREDICTION.md](ML_PREDICTION.md)**: Machine learning prediction system guide
- **[SECURITY.md](SECURITY.md)**: Security considerations and best practices

## 🎯 Quick Start

### 1. Run Standard Attack
```
1. Navigate to "Attack" tab
2. Click "Templates" to load a pre-configured attack
3. Select algorithm (LLL or BKZ)
4. Click "Run Attack"
5. View results and visualizations
```

### 2. Scan Blockchain Signatures
```
1. Navigate to "RPC Scanner" tab
2. Enter your RPC endpoint URL
3. Specify block range (max 1000 blocks)
4. Click "Scan for Weak Signatures"
5. Review detected vulnerabilities
6. Generate attacks from findings
```

### 3. Batch Analysis
```
1. After scanning, click "Run Batch Analysis"
2. Review pattern clusters and statistical analysis
3. Generate attacks from detected clusters
4. Execute with optimized LLL/BKZ parameters
```

### 4. ML Pattern Prediction (NEW!)
```
1. Scan blocks to gather training data
2. Navigate to "ML Predictions" tab
3. Configure target block range (max 500 blocks)
4. Click "Generate ML Predictions"
5. Review confidence scores and reasoning
6. Scan suggested high-priority blocks
7. Validate predictions and iterate
```

## 🔬 Educational Features

- **Interactive Visualizations**: See how LLL transforms vectors step-by-step
- **Matrix Heatmaps**: Visualize basis matrix evolution during reduction
- **Orthogonality Charts**: Track basis quality improvements
- **Algorithm Comparison**: Compare LLL vs BKZ performance and reduction quality
- **Real-World Examples**: Learn from actual blockchain vulnerability patterns
- **Detailed Help**: Comprehensive documentation for all attack types and ML predictions

## 🛠 Technology Stack

- **React + TypeScript**: Type-safe reactive UI
- **D3.js**: Advanced data visualizations
- **Shadcn UI**: Modern component library
- **Tailwind CSS**: Utility-first styling
- **Framer Motion**: Smooth animations
- **Machine Learning**: Custom statistical model + optional AI enhancement
- **Web3 RPC**: Blockchain signature analysis

## 🧪 Use Cases

- **Security Research**: Analyze cryptographic implementations for weaknesses
- **Education**: Learn lattice-based cryptanalysis techniques
- **Blockchain Security**: Audit transaction signatures for vulnerabilities
- **Penetration Testing**: Test signature schemes in controlled environments
- **Pattern Discovery**: Use ML to identify vulnerability trends across blocks
- **Efficient Scanning**: Prioritize high-risk blocks using predictive analytics

## ⚠️ Ethical Use

This tool is designed for:
- ✅ Security research and education
- ✅ Penetration testing with authorization
- ✅ Academic study of cryptographic systems
- ✅ Auditing your own implementations
- ✅ Responsible vulnerability disclosure

**Do NOT use for:**
- ❌ Unauthorized access to systems
- ❌ Theft of funds or private keys
- ❌ Malicious attacks on production systems

## 📄 License

The Spark Template files and resources from GitHub are licensed under the terms of the MIT license, Copyright GitHub, Inc.
