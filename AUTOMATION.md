# Automation Engine

The Automation Engine is the core orchestration system that enables fully autonomous vulnerability discovery and exploitation. It chains together scanning, analysis, prediction, attack execution, and pattern learning into a seamless workflow.

## Overview

The automation engine operates in two modes:
- **Run Once**: Execute a single complete workflow cycle manually
- **Start Auto**: Run continuous workflows at configurable intervals

## Workflow Phases

### 1. Scanning Phase
- Connects to configured RPC endpoint
- Scans specified block range for transactions
- Extracts ECDSA/DSA signatures
- Identifies weak signatures (nonce reuse, bias, etc.)
- Updates scan metrics

### 2. Analysis Phase
- Performs batch analysis on collected signatures
- Detects cross-transaction patterns
- Creates vulnerability clusters
- Calculates statistical patterns
- Generates recommendations

### 3. Prediction Phase
- Uses ML to forecast vulnerable blocks
- Analyzes historical scan data
- Generates confidence scores
- Prioritizes future scan targets
- (Optional) Uses GPT-4o-mini for enhanced predictions

### 4. Attack Phase
- Converts detected weaknesses to lattice problems
- Queues attacks by priority
- Executes attacks in parallel (up to configured limit)
- Runs LLL or BKZ based on vulnerability type
- Collects attack results

### 5. Learning Phase
- Analyzes successful attacks
- Extracts optimal parameters (delta, algorithm, block size)
- Groups patterns by problem structure
- Stores learned configurations
- Builds knowledge base

## Configuration Options

### Basic Settings
- **RPC Endpoint**: Blockchain node URL (Ethereum-compatible)
- **Start Block**: Initial block number for scanning
- **Blocks Per Scan**: Number of blocks to scan in each cycle (1-1000)
- **Auto-Scan Interval**: Milliseconds between automated cycles (min: 10000)

### Workflow Toggles
- **Auto Analyze**: Enable automatic batch analysis after scanning
- **Auto Attack**: Enable automatic attack execution on detected vulnerabilities
- **Auto Learn**: Enable automatic pattern extraction from successful attacks

### Advanced Settings
- **Priority Threshold**: Minimum severity to trigger attacks
  - Critical Only: Only execute attacks on critical vulnerabilities
  - High & Above: Execute on high and critical
  - Medium & Above: Execute on medium, high, and critical
  - All Priorities: Execute all queued attacks
- **Max Concurrent Attacks**: Number of attacks to run in parallel (1-10)

## Attack Queue & Prioritization

The automation engine maintains an intelligent attack queue:

### Priority Levels
1. **Nonce Reuse** (100): Direct private key recovery
2. **Small r-values** (90): Implementation errors
3. **Biased Nonces** (80): HNP lattice attack
4. **Similar k-values** (70): Weak RNG
5. **Batch Clusters** (60 + cluster size): Multi-signature patterns
6. **High s-values** (50): Non-canonical signatures

### Queue Management
- Attacks are automatically prioritized by severity
- Critical weaknesses jump to front of queue
- Parallel execution up to configured limit
- Failed attacks are logged but don't block queue

## Pattern Learning System

The learning system builds a knowledge base of effective attack configurations.

### Pattern Extraction
For each successful attack, the system records:
- Matrix dimensions
- Optimal delta parameter
- Best algorithm (LLL vs BKZ)
- Ideal block size (for BKZ)
- Average vector length
- Orthogonality score
- Execution time
- Success rate

### Pattern Application
When queueing future attacks:
1. Check if similar problem structure exists in learned patterns
2. If match found, use optimal parameters from pattern
3. If no match, use default parameters
4. Update pattern statistics after execution

### Pattern Grouping
Patterns are grouped by:
- Matrix size (NxN)
- Problem type (nonce reuse, bias, etc.)
- Algorithm performance

## Monitoring & Metrics

### Real-Time Metrics
- **Total Blocks Scanned**: Cumulative across all cycles
- **Weaknesses Found**: Total vulnerabilities detected
- **Attacks Executed**: Number of attacks completed
- **Success Rate**: Percentage of successful attacks

### Activity History
Every automation action is logged:
- Timestamp
- Action type (scan, analyze, attack, etc.)
- Details (block range, results, errors)
- Success/failure status

Logs are persisted and can be cleared manually.

### Learned Patterns
Pattern library shows:
- Pattern name and ID
- Success rate
- Average execution time
- Optimal parameters (delta, algorithm, block size)
- Problem features (matrix size, orthogonality)
- Timestamp of learning

## Best Practices

### Initial Setup
1. Start with small block ranges (10-20 blocks) to test RPC connection
2. Enable all workflow phases (analyze, attack, learn)
3. Set priority threshold to "High & Above" initially
4. Use 2-3 concurrent attacks to start

### Continuous Operation
1. Monitor activity history for errors
2. Adjust scan interval based on RPC rate limits
3. Increase concurrency if system handles load well
4. Review learned patterns periodically
5. Clear history when it grows large (>100 entries)

### Optimization
1. Use learned patterns to skip manual configuration
2. Increase blocks per scan as confidence grows
3. Lower priority threshold to catch more vulnerabilities
4. Adjust concurrency based on attack execution times

### Troubleshooting
- **No weaknesses found**: Normal for many block ranges; try different ranges
- **RPC errors**: Check endpoint URL, rate limits, and connectivity
- **Slow execution**: Reduce blocks per scan or concurrent attacks
- **Learning not working**: Ensure attacks are completing successfully

## Security Considerations

### RPC Endpoints
- Never use RPC endpoints with write access
- Prefer public endpoints or dedicated read-only nodes
- Be aware of rate limits and query costs
- Consider using private/paid endpoints for reliability

### API Keys
- Private RPC URLs may contain API keys in query parameters
- Keys are stored in browser localStorage (persisted)
- Clear browser data to remove stored endpoints
- Don't share screenshots or logs containing endpoints

### Attack Execution
- Attacks run in browser and don't interact with blockchain
- No private keys are generated or stored
- Results are for educational/research purposes only
- Ensure you have permission to scan target networks

## Performance Notes

### Browser Constraints
- Large matrix operations may slow down browser
- Parallel attacks compete for CPU resources
- Memory usage grows with attack history
- Clear history periodically for best performance

### Optimization Tips
- BKZ is slower than LLL but more thorough
- Larger block sizes increase BKZ execution time
- Visualization capture adds overhead (disable for large attacks)
- Lower concurrency if browser becomes unresponsive

## API Integration

The automation engine can be controlled programmatically (future feature):
- Start/stop automation via functions
- Query current state and metrics
- Subscribe to events (attack complete, weakness found)
- Export results in structured format

## Future Enhancements

Potential additions to the automation engine:
- Webhook notifications for discoveries
- Export results to CSV/JSON
- Dashboard view with time-series graphs
- Custom attack strategies
- Integration with external lattice solvers
- Distributed execution across multiple browsers
- Attack result persistence to database
- Advanced ML models for prediction
