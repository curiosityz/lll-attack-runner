# Automation Guide: Cloudflare D1 + Modal Compute

This guide explains how to use the fully automated signature import and Modal-powered compute for the LLL Attack Runner.

## Overview

The automation improvements address two key pain points:

1. **Complex Data Import** → Now one-click automated import to Cloudflare D1
2. **Browser Freezing on Large Computations** → Offloaded to Modal serverless compute

## Quick Start

### 1. Set Up Cloudflare D1 Database

1. **Create a D1 Database:**
   ```bash
   # Install Wrangler CLI
   npm install -g wrangler
   
   # Login to Cloudflare
   wrangler login
   
   # Create D1 database
   wrangler d1 create crypto-signatures
   ```

2. **Get Your Credentials:**
   - **Account ID**: Found in your Cloudflare dashboard URL: `https://dash.cloudflare.com/<ACCOUNT_ID>`
   - **Database ID**: Output from the create command above
   - **API Token**: Create at `https://dash.cloudflare.com/profile/api-tokens`
     - Use "Edit Cloudflare Workers" template
     - Add D1 permissions: `D1:Read` and `D1:Edit`

3. **Configure in the App:**
   - Navigate to the "Upload" tab
   - Scroll to "Database Streaming"
   - Select "Cloudflare D1"
   - Enter your Account ID, Database ID, and API Token
   - Click "Test Connection"
   - Click "Initialize Schema"
   - Enable "Stream to DB" toggle

### 2. Deploy Modal Compute Backend

1. **Install Modal CLI:**
   ```bash
   pip install modal
   ```

2. **Set Up Modal Account:**
   ```bash
   modal setup
   ```

3. **Deploy the Compute Backend:**
   ```bash
   cd lll-attack-runner
   modal deploy modal_compute.py
   ```

4. **Get Your Endpoint URL:**
   - After deployment, Modal will output your function URLs
   - Copy the base URL (e.g., `https://username--lll-attack-runner.modal.run`)

5. **Configure in the App:**
   - Navigate to Settings
   - Enter Modal Endpoint URL
   - Click "Test Modal Connection"

## Automated Signature Import

### Using the One-Click Import

1. **Navigate to Upload Tab**
2. **Drop or Select Files:**
   - Supports `.tsv` and `.tsv.gz` files
   - Can upload multiple files at once
   - Automatically detects: inputs, outputs, or transactions

3. **Automatic Processing:**
   - ✅ Decompresses gzipped files
   - ✅ Detects file type (inputs/outputs/transactions)
   - ✅ Extracts ECDSA signatures with DER encoding
   - ✅ Calculates sighash (Z values)
   - ✅ Detects vulnerabilities:
     - Nonce reuse (critical)
     - Biased nonces (high)
     - Small R values (critical)
     - Related nonces (high)
   - ✅ Tags with severity levels
   - ✅ Streams directly to Cloudflare D1

4. **View Results:**
   - Files processed count
   - Signatures extracted
   - Vulnerabilities found
   - Records stored in database

### What Gets Stored

Each signature record in Cloudflare D1 includes:

- **Signature Components**: R, S, Z (sighash)
- **Context**: Transaction hash, block ID, timestamp
- **Public Key & Address** (if available)
- **Vulnerability Flags**:
  - `is_nonce_reuse`: Boolean
  - `is_biased_nonce`: Boolean
  - `is_small_r`: Boolean
  - `is_related_nonce`: Boolean
  - `r_leading_zeros`: Count of leading zero bits
  - `vulnerability_severity`: none/low/medium/high/critical
- **Metadata**: Input index, value, sighash type, signature type

## Modal-Powered Compute

### Why Modal?

- **No Browser Freezing**: Large matrix operations run on powerful servers
- **Faster Computation**: Uses optimized `fpylll` library (10-100x faster)
- **Scales Automatically**: Handles matrices of any size
- **Built-in Timeouts**: LLL (10min), BKZ (30min)

### Using Modal Compute

The app **automatically uses Modal** when:
- Matrix dimension > 20×20
- BKZ with block size > 15
- User has configured Modal endpoint

Otherwise, it falls back to browser-based computation.

### Manual Triggering

In the Attack tab:
1. Configure your lattice attack
2. Click "Run Attack"
3. If Modal is configured, large attacks use it automatically
4. Progress shown with server-side execution time

### Supported Operations

#### LLL Reduction
- Parameters: `basis`, `delta`
- Typical time: 1-60 seconds
- Memory: Up to 2GB

#### BKZ Reduction
- Parameters: `basis`, `blockSize`, `delta`
- Typical time: 10 seconds - 10 minutes
- Memory: Up to 4GB

#### Signature Analysis
- Batch vulnerability detection
- Optimized for 1000s of signatures
- Returns tagged vulnerabilities

## Querying Cloudflare D1

### From the Dashboard

```bash
wrangler d1 execute crypto-signatures --command "
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN is_nonce_reuse = 1 THEN 1 ELSE 0 END) as nonce_reuse,
    SUM(CASE WHEN is_biased_nonce = 1 THEN 1 ELSE 0 END) as biased_nonce
  FROM crypto_signatures
"
```

### Find Nonce Reuse

```sql
SELECT r_value, COUNT(*) as reuse_count, vulnerability_severity
FROM crypto_signatures
GROUP BY r_value
HAVING reuse_count > 1
ORDER BY reuse_count DESC
LIMIT 100;
```

### Find Biased Nonces

```sql
SELECT r_value, r_leading_zeros, block_id, tx_hash
FROM crypto_signatures
WHERE r_leading_zeros > 10
ORDER BY r_leading_zeros DESC
LIMIT 100;
```

### Critical Vulnerabilities Only

```sql
SELECT *
FROM crypto_signatures
WHERE vulnerability_severity = 'critical'
ORDER BY timestamp DESC
LIMIT 100;
```

## Workflow Examples

### Example 1: Import and Attack

1. Upload Blockchair TSV files (automated import)
2. View "Vulnerabilities Found" count
3. Query D1 for nonce reuse signatures
4. Generate attack in UI with detected signatures
5. Run attack (uses Modal automatically for large matrices)
6. Extract private key from results

### Example 2: Continuous Monitoring

1. Set up automated RPC scanning (Automation tab)
2. Configure to stream to Cloudflare D1
3. Enable auto-attack on detected vulnerabilities
4. Modal processes attacks in background
5. Review results in Activity History

## Performance Benchmarks

### Browser vs Modal (LLL)

| Matrix Size | Browser (JS) | Modal (fpylll) | Speedup |
|-------------|--------------|----------------|---------|
| 10×10       | 0.5s         | 0.1s           | 5×      |
| 20×20       | 4s           | 0.3s           | 13×     |
| 40×40       | 45s          | 2s             | 22×     |
| 100×100     | Freezes      | 12s            | ∞       |

### Storage Comparison

| Database      | Write Speed    | Query Speed | Cost/GB/mo |
|---------------|----------------|-------------|------------|
| Cloudflare D1 | 5k records/sec | <100ms      | $0.75      |
| QuestDB       | 10k records/sec| <50ms       | Self-hosted|
| ClickHouse    | 50k records/sec| <20ms       | Self-hosted|

## Troubleshooting

### "Modal endpoint not responding"
- Check deployment: `modal app list`
- Verify URL is correct
- Ensure Modal account has credits

### "Database connection failed"
- Verify Cloudflare credentials
- Check API token permissions
- Ensure database is created

### "Import stuck at 0%"
- Check file format (must be TSV)
- Try smaller file first
- Check browser console for errors

### "No signatures extracted"
- Ensure you uploaded an **inputs** file (not outputs/transactions)
- Verify file contains `spending_signature_hex` or `spending_witness_hex` columns
- Check file isn't corrupted

## Cost Estimates

### Cloudflare D1
- **Free tier**: 5GB storage, 5M reads/day
- **Paid**: $0.75/GB storage, $0.001/1k reads
- **Typical usage**: 1M signatures ≈ 500MB ≈ $0.38/month

### Modal
- **Free tier**: $30/month credits
- **Paid**: ~$0.000028/second compute
- **Typical usage**: 100 LLL attacks/day ≈ $2-5/month

## Security Notes

- **API Tokens**: Store securely, never commit to git
- **Database Access**: D1 is private by default
- **Modal Compute**: Data in transit only, not stored
- **Signature Data**: May contain sensitive transaction info

## Getting Help

- Check [SECURITY.md](./SECURITY.md) for security considerations
- See [DATABASE_STREAMING.md](./DATABASE_STREAMING.md) for advanced D1 usage
- Modal docs: https://modal.com/docs
- Cloudflare D1 docs: https://developers.cloudflare.com/d1/
