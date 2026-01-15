# Blockchain Explorer Integration

## Overview

The Blockchain Explorer Integration allows you to fetch real transaction data directly from multiple blockchain explorer APIs without needing to run your own node or configure RPC endpoints. This feature provides a seamless way to analyze real-world cryptographic signatures from Bitcoin and Ethereum transactions.

## Features

### Multi-Explorer Support
- **Blockchair**: Primary explorer with support for Bitcoin, Ethereum, and Bitcoin Testnet
- **Blockchain.com**: Bitcoin-focused explorer with comprehensive transaction history
- **BlockCypher**: Multi-chain explorer with detailed transaction metadata
- **Automatic Fallback**: If one explorer fails, automatically tries the next one

### Supported Blockchains
1. **Bitcoin Mainnet** - Analyze Bitcoin transactions and ECDSA signatures
2. **Bitcoin Testnet** - Test with testnet transactions without real funds
3. **Ethereum Mainnet** - Analyze Ethereum transactions and signatures

### Key Capabilities

#### 1. Transaction Fetching
- Retrieve up to 100 recent transactions for any address
- View transaction hashes, block numbers, and timestamps
- See transaction values and involved addresses

#### 2. Signature Extraction
- Automatically extract cryptographic signatures (r, s, v) from transactions
- Parse signature data from transaction input fields
- Support for both explicit signature fields and embedded signatures

#### 3. Automated Analysis Integration
- Extracted signatures automatically flow into the analysis pipeline
- Detected weaknesses trigger automatic attack configuration
- Seamless workflow from fetching to exploitation

## Usage

### Basic Workflow

1. **Select Blockchain**
   - Choose from Bitcoin Mainnet, Bitcoin Testnet, or Ethereum Mainnet
   - Different blockchains have different signature formats

2. **Enter Address**
   - Paste any blockchain address
   - Click "Use Example" to load a pre-configured example address
   - Press Enter or click "Search" to begin

3. **View Results**
   - Transaction count and signature extraction statistics
   - Scrollable list of recent transactions
   - Detailed signature data (r, s, z values)
   - Block numbers and timestamps for each transaction

4. **Automatic Analysis**
   - Extracted signatures are automatically analyzed for weaknesses
   - Switch to the "Analyze" tab to see detected patterns
   - Generate attacks directly from found vulnerabilities

### Example Addresses

#### Bitcoin Genesis Block (Satoshi)
```
1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
```
The first Bitcoin address ever created. Historic but may have limited transaction data.

#### Bitcoin Testnet
```
mkHS9ne12qx9pS9VojpwU5xtRd4T7X7ZUt
```
Sample testnet address for testing without real funds.

#### Ethereum (Vitalik's Address)
```
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
```
Well-known Ethereum address with substantial transaction history.

## Technical Details

### Rate Limiting
Each explorer has built-in rate limiting to respect API guidelines:
- **Blockchair**: 300ms between requests
- **Blockchain.com**: 500ms between requests  
- **BlockCypher**: 200ms between requests

### Timeout Protection
All requests have a 30-second timeout to prevent hanging on slow APIs.

### Signature Extraction Logic

The system uses multiple methods to extract signatures:

1. **Direct Fields**: If transaction data includes `r`, `s`, `v` fields directly
2. **Input Parsing**: Extract from transaction input data (last 130 characters typically contain signature)
3. **Witness Data**: Parse segregated witness data for Bitcoin transactions

### Data Flow

```
Address → Explorer API → Transactions → Signature Extraction → Analysis Pipeline → Attack Generation
```

## Error Handling

### Common Issues

#### No Signatures Found
- Address may have no outgoing transactions
- Transactions may not include extractable signature data
- Try a different address or blockchain

#### API Errors
- Explorer may be rate-limiting or temporarily unavailable
- System automatically tries alternative explorers
- Check internet connectivity

#### Invalid Address Format
- Ensure address matches the selected blockchain
- Bitcoin addresses start with '1', '3', or 'bc1'
- Ethereum addresses start with '0x' and are 42 characters

## Integration with Other Features

### Upload Tab
- Blockchain Explorer is the first component in the Upload tab
- Provides an alternative to manual data upload
- Fetches real, current data on demand

### Analyze Tab
- Extracted signatures automatically populate the analysis engine
- Weaknesses are detected using the same algorithms as uploaded data
- Pattern clustering works across explorer-fetched signatures

### Attack Tab
- Vulnerabilities detected in explorer data can generate attacks
- Click "Generate Attack" from the analysis results
- Attack configurations are optimized for the detected weakness type

## Privacy & Security

### Data Privacy
- All API calls are made directly from your browser
- No data is stored on external servers
- Transaction data is only cached in your browser session

### API Keys
- Current implementation uses public API endpoints
- No authentication required
- Rate limits are shared across all users of the public APIs

### Security Considerations
- Only fetches public blockchain data
- Does not access private keys or wallet data
- Read-only operations - cannot create or sign transactions

## Performance Tips

1. **Use Specific Addresses**: Addresses with moderate transaction counts (10-100) work best
2. **Avoid Very Active Addresses**: Exchanges or popular contracts may have rate limit issues
3. **Wait Between Searches**: Allow a few seconds between consecutive searches
4. **Try Different Explorers**: If one fails, the system automatically tries others

## Future Enhancements

Potential improvements for future versions:
- Support for more blockchains (Litecoin, Bitcoin Cash, etc.)
- Custom API key configuration for higher rate limits
- Bulk address analysis
- Transaction filtering by date range
- Export fetched data to CSV/JSON
- Direct integration with hardware wallets for signature analysis

## Troubleshooting

### "Failed to fetch data"
- Check internet connection
- Try a different blockchain or address
- Wait a moment and try again (rate limiting)

### "No signatures found"
- Address may have only incoming transactions
- Try an address known to have sent transactions
- Use one of the example addresses

### Slow Loading
- Large transaction histories take longer to fetch
- Multiple explorer attempts may increase wait time
- Consider addresses with fewer transactions

## API Documentation Links

- [Blockchair API](https://github.com/Blockchair/Blockchair.Support/blob/master/API.md)
- [Blockchain.com API](https://www.blockchain.com/api)
- [BlockCypher API](https://www.blockcypher.com/dev/bitcoin/)
