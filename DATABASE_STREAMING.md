# Database Streaming Integration

This document describes the database streaming feature for persisting ECDSA signature data extracted from blockchain dumps.

## Overview

The Lattice Attack Suite can now stream extracted signature data directly to a time-series or columnar database for persistent storage and advanced querying. This enables:

- **Petabyte-scale storage** of cryptographic signatures
- **Fast vulnerability queries** (nonce reuse detection, biased nonce search)
- **Historical analysis** and pattern discovery over time
- **Integration with external analytics tools**

## Supported Databases

### QuestDB (Recommended for Time-Series)

QuestDB is a high-performance time-series database with native SQL support.

**Quick Start with Docker:**
```bash
docker run -p 9000:9000 questdb/questdb
```

**Default Configuration:**
- Host: `localhost`
- Port: `9000`
- Uses HTTP/ILP protocol for writes

### ClickHouse (Recommended for Analytics)

ClickHouse is a columnar OLAP database ideal for petabyte-scale analytics.

**Quick Start with Docker:**
```bash
docker run -p 8123:8123 clickhouse/clickhouse-server
```

**Default Configuration:**
- Host: `localhost`
- Port: `8123`
- Uses HTTP interface

### InfluxDB (Time-Series with Visualization)

InfluxDB v2 offers built-in dashboards and alerting.

**Quick Start with Docker:**
```bash
docker run -p 8086:8086 influxdb:2
```

**Configuration:**
- Host: `localhost`
- Port: `8086`
- Requires API token for v2
- Specify org and bucket

## Database Schema

The `crypto_signatures` table stores extracted signature data:

| Column | Type | Description |
|--------|------|-------------|
| `r_value` | STRING(64) | R component of ECDSA signature (hex) |
| `s_value` | STRING(64) | S component of ECDSA signature (hex) |
| `z_hash` | STRING(64) | Message hash (sighash) in hex |
| `pubkey` | STRING | Compressed public key (optional) |
| `address` | STRING | Bitcoin/Ethereum address |
| `tx_hash` | STRING(64) | Transaction hash |
| `input_index` | INT | Input index in transaction |
| `block_id` | INT | Block number |
| `timestamp` | TIMESTAMP | Block timestamp |
| `value_satoshis` | LONG | Transaction value in satoshis |
| `sighash_type` | SHORT | Sighash type (1=ALL, 2=NONE, etc.) |
| `signature_type` | SYMBOL | 'legacy' or 'segwit' |
| `is_nonce_reuse` | BOOLEAN | Nonce reuse vulnerability detected |
| `is_biased_nonce` | BOOLEAN | Biased nonce vulnerability detected |
| `is_small_r` | BOOLEAN | Small R value detected |
| `is_related_nonce` | BOOLEAN | Related nonce detected |
| `r_leading_zeros` | SHORT | Count of leading zero bits in R |
| `vulnerability_severity` | SYMBOL | 'none', 'low', 'medium', 'high', 'critical' |

## Usage

### 1. Configure Database Connection

1. Navigate to the **Upload** tab
2. Scroll down to the **Database Streaming** panel
3. Select your database type (QuestDB, ClickHouse, or InfluxDB)
4. Enter connection details (host, port, credentials)
5. Click **Test Connection** to verify connectivity
6. Click **Initialize Schema** to create the table
7. Click **Save Configuration** to persist settings

### 2. Enable Streaming

Toggle the **Stream to DB** switch to enable automatic streaming. When enabled:

- All Blockchair TSV uploads will stream signatures to the database
- All JSON/CSV data uploads will stream signatures to the database
- Streaming statistics are displayed in the panel

### 3. Query Vulnerabilities

Example SQL queries for QuestDB/ClickHouse:

**Find Nonce Reuse (Critical Vulnerability):**
```sql
SELECT r_value, COUNT(*) as reuse_count, 
       array_agg(tx_hash) as transactions
FROM crypto_signatures
GROUP BY r_value
HAVING COUNT(*) > 1
ORDER BY reuse_count DESC;
```

**Find Biased Nonces (Lattice Attack Candidates):**
```sql
SELECT * FROM crypto_signatures
WHERE r_leading_zeros >= 10
ORDER BY r_leading_zeros DESC
LIMIT 1000;
```

**Vulnerability Statistics:**
```sql
SELECT 
  vulnerability_severity,
  COUNT(*) as count,
  COUNT(CASE WHEN is_nonce_reuse THEN 1 END) as nonce_reuse,
  COUNT(CASE WHEN is_biased_nonce THEN 1 END) as biased,
  COUNT(CASE WHEN is_small_r THEN 1 END) as small_r
FROM crypto_signatures
GROUP BY vulnerability_severity;
```

## Streaming Statistics

The Database Streaming panel displays:

- **Total Streamed**: Number of signatures sent to database
- **Successful**: Successfully written records
- **Errors**: Failed writes (check logs for details)
- **Data Written**: Total bytes transmitted

## Troubleshooting

### Connection Timeout
- Verify the database is running and accessible
- Check firewall rules allow the configured port
- Increase timeout if database is remote

### Authentication Errors
- Verify username/password are correct
- For InfluxDB v2, ensure API token is valid
- Check database user has write permissions

### Schema Errors
- Run "Initialize Schema" before streaming
- Verify database name exists (for ClickHouse)
- Check for schema conflicts with existing tables

### CORS Issues
- Database must allow requests from browser origin
- Configure database CORS headers or use a proxy
- Consider running database on same host as dev server

## Security Considerations

- Database credentials are stored in browser localStorage
- Use TLS/HTTPS for production deployments
- Restrict database user to minimal required permissions
- Don't expose database ports to public internet
- Consider using a backend proxy for production

## API Reference

The `DatabaseClient` class in `src/lib/database-client.ts` provides:

```typescript
// Create client with configuration
const client = new DatabaseClient({
  type: 'questdb',
  host: 'localhost',
  port: 9000,
  useTLS: false
});

// Test connection
const result = await client.testConnection();

// Initialize schema
await client.initializeSchema();

// Stream signatures
await client.streamSignatures(extractedSignatures);

// Query nonce reuse
const reused = await client.queryNonceReuse();

// Get statistics
const stats = client.getStats();
```

## Future Enhancements

- [ ] Batch streaming with configurable batch size
- [ ] Automatic retry with exponential backoff
- [ ] Real-time dashboard integration
- [ ] Export to Parquet format
- [ ] Distributed processing support
