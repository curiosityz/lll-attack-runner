# Automation Architecture

This document provides a technical overview of the automation system architecture.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface (React)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ Automation Tab   │  │  Attack Tab      │  │ Scanner Tab  │ │
│  │ - Config UI      │  │  - Manual Runs   │  │ - RPC Scan   │ │
│  │ - Metrics        │  │  - Templates     │  │ - Batch Anal.│ │
│  │ - History        │  │  - Visualize     │  │ - ML Predict │ │
│  │ - Patterns       │  │  - Results       │  │              │ │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘ │
│           │                     │                    │         │
└───────────┼─────────────────────┼────────────────────┼─────────┘
            │                     │                    │
            └──────────┬──────────┴─────────┬──────────┘
                       │                    │
            ┌──────────▼───────────────────▼──────────┐
            │      Automation Engine Core              │
            │  ┌────────────────────────────────────┐  │
            │  │   State Management                 │  │
            │  │   - Current Phase                  │  │
            │  │   - Progress Tracking              │  │
            │  │   - Metrics Aggregation            │  │
            │  │   - Error Handling                 │  │
            │  └────────────────────────────────────┘  │
            │                                          │
            │  ┌────────────────────────────────────┐  │
            │  │   Workflow Orchestrator            │  │
            │  │   - Phase Sequencing               │  │
            │  │   - Cycle Scheduling               │  │
            │  │   - State Transitions              │  │
            │  └────────────────────────────────────┘  │
            │                                          │
            │  ┌────────────────────────────────────┐  │
            │  │   Attack Queue Manager             │  │
            │  │   - Priority Sorting               │  │
            │  │   - Concurrency Control            │  │
            │  │   - Task Distribution              │  │
            │  └────────────────────────────────────┘  │
            │                                          │
            │  ┌────────────────────────────────────┐  │
            │  │   Pattern Learning System          │  │
            │  │   - Success Analysis               │  │
            │  │   - Parameter Optimization         │  │
            │  │   - Pattern Storage                │  │
            │  └────────────────────────────────────┘  │
            └──────────┬───────────────────┬───────────┘
                       │                   │
        ┌──────────────┴────────┐   ┌──────▼────────────┐
        │                       │   │                   │
┌───────▼───────┐  ┌───────────▼───▼───────┐  ┌────────▼──────┐
│ RPC Scanner   │  │  Batch Analysis       │  │ ML Predictor  │
│ - Connect RPC │  │  - Pattern Detection  │  │ - Forecasting │
│ - Fetch Txns  │  │  - Clustering         │  │ - Prioritize  │
│ - Detect Weak │  │  - Statistics         │  │ - AI Enhance  │
└───────┬───────┘  └───────────┬───────────┘  └────────┬──────┘
        │                      │                       │
        └──────────────┬───────┴────────┬──────────────┘
                       │                │
               ┌───────▼────────────────▼─────────┐
               │   Attack Execution Engine        │
               │  ┌────────────────────────────┐  │
               │  │  Lattice Generator         │  │
               │  │  - Weakness → Basis        │  │
               │  │  - Parameter Selection     │  │
               │  └────────────────────────────┘  │
               │                                  │
               │  ┌────────────────────────────┐  │
               │  │  Parallel Executor         │  │
               │  │  - Promise.all()           │  │
               │  │  - Concurrency Limit       │  │
               │  └────────────────────────────┘  │
               │                                  │
               │  ┌────────────────────────────┐  │
               │  │  LLL/BKZ Algorithms        │  │
               │  │  - Lattice Reduction       │  │
               │  │  - Result Validation       │  │
               │  └────────────────────────────┘  │
               └───────────────┬──────────────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Persistence Layer   │
                    │  - useKV hooks       │
                    │  - Browser Storage   │
                    │  - Config            │
                    │  - Patterns          │
                    │  - History           │
                    └──────────────────────┘
```

## Data Flow

### Workflow Cycle Data Flow

```
1. User Configuration
   ↓
2. Automation Engine (config stored via useKV)
   ↓
3. SCAN PHASE
   RPC Scanner ← [config.rpcUrl, config.startBlock, config.scanBatchSize]
   → ScanResult { allSignatures[], weakSignatures[], scanned }
   ↓
4. ANALYZE PHASE (if config.autoAnalyze)
   Batch Analysis ← [ScanResult.allSignatures]
   → BatchAnalysisResult { clusters[], statisticalPatterns[], recommendations[] }
   ↓
5. PREDICT PHASE (if BatchAnalysisResult exists)
   ML Predictor ← [allSignatures, weakSignatures, clusters, predictRange]
   → MLPredictionResult { predictions[], confidence[], recommendations[] }
   ↓
6. QUEUE PHASE (if config.autoAttack)
   Attack Queue ← [weakSignatures, clusters]
   → Sort by priority, filter by threshold
   → AttackQueueItem[] (sorted, filtered)
   ↓
7. EXECUTE PHASE
   Parallel Executor ← [queue, config.maxConcurrentAttacks]
   → Split queue into batches of N
   → For each batch: Promise.all(attacks)
   → AttackHistory[] (all results)
   ↓
8. LEARN PHASE (if config.autoLearn)
   Pattern Learner ← [AttackHistory[] where success = true]
   → Group by matrix size
   → Calculate optimal parameters
   → LearnedPattern[] (stored via useKV)
   ↓
9. COMPLETE
   Update metrics, log activity, schedule next (if auto)
```

### Attack Queue Priority Flow

```
Input: weakSignatures, clusters
  ↓
Convert to AttackQueueItems:
  - For each weakness:
    → Generate lattice basis
    → Assign priority based on type
    → Set algorithm (LLL/BKZ)
    → Add to queue
  - For each cluster:
    → Generate batch attack
    → Assign priority (60 + size)
    → Set algorithm (from config generator)
    → Add to queue
  ↓
Sort queue by priority (descending)
  ↓
Filter by config.priorityThreshold:
  - critical: Keep items with priority ≥ 90
  - high: Keep items with priority ≥ 70
  - medium: Keep items with priority ≥ 50
  - low: Keep all items
  ↓
Output: Sorted, filtered AttackQueueItem[]
```

### Pattern Learning Flow

```
Input: AttackHistory[] (successful attacks only)
  ↓
Group by matrix size:
  Map<size, AttackHistory[]>
  ↓
For each group (where count ≥ 2):
  ↓
  Calculate statistics:
    - avgExecutionTime = sum(times) / count
    - optimalDelta = sum(deltas) / count
    - optimalAlgorithm = mode(algorithms)
    - optimalBlockSize = sum(blockSizes) / count (BKZ only)
  ↓
  Calculate features:
    - matrixSize = N (from NxN matrix)
    - avgVectorLength = sqrt(sum(v[i]²)) averaged
    - orthogonality = 1 - avg(|dot(vi,vj)| / (||vi|| ||vj||))
  ↓
  Create LearnedPattern:
    {
      id, name, successRate, avgExecutionTime,
      optimalDelta, optimalAlgorithm, optimalBlockSize,
      basis, features, timestamp
    }
  ↓
Output: LearnedPattern[] (stored via useKV)
```

## Component Hierarchy

```
App.tsx
└── Tabs
    ├── Attack Tab
    │   ├── Attack Configuration
    │   ├── Attack Execution
    │   └── Result Display
    │
    ├── RPC Scanner Tab
    │   ├── RPC Configuration
    │   ├── Scan Execution
    │   ├── Batch Analysis Display
    │   ├── ML Prediction Display
    │   └── Weakness Cards
    │
    ├── Automation Tab ⭐ NEW
    │   ├── AutomationControl
    │   │   ├── Control Panel
    │   │   │   ├── Start/Stop Buttons
    │   │   │   └── Status Indicators
    │   │   │
    │   │   ├── Metrics Dashboard
    │   │   │   ├── Blocks Scanned
    │   │   │   ├── Weaknesses Found
    │   │   │   ├── Attacks Executed
    │   │   │   └── Success Rate
    │   │   │
    │   │   ├── Configuration Form
    │   │   │   ├── RPC Settings
    │   │   │   ├── Scan Parameters
    │   │   │   ├── Workflow Toggles
    │   │   │   └── Advanced Options
    │   │   │
    │   │   ├── Activity History
    │   │   │   └── ScrollArea
    │   │   │       └── History Items
    │   │   │
    │   │   └── Learned Patterns
    │   │       └── ScrollArea
    │   │           └── Pattern Cards
    │   │
    │   └── AutomationEngine (ref)
    │       └── Engine instance (singleton-ish)
    │
    ├── Visualization Tab
    │   └── (existing)
    │
    ├── History Tab
    │   └── (existing)
    │
    └── Help Tab
        └── (updated with automation docs)
```

## State Management

### Automation State

```typescript
interface AutomationState {
  isRunning: boolean                    // Engine active?
  currentPhase: Phase                   // Current workflow phase
  progress: number                      // Progress % (0-100)
  totalScanned: number                  // Cumulative blocks
  totalWeaknessesFound: number          // Cumulative weaknesses
  totalAttacksExecuted: number          // Cumulative attacks
  successfulAttacks: number             // Successful attacks
  queue: AutomationTask[]               // Current task queue
  history: AutomationHistory[]          // Activity log
  lastError?: string                    // Most recent error
}

type Phase = 
  | 'idle'       // Not running
  | 'scanning'   // RPC scan in progress
  | 'analyzing'  // Batch analysis running
  | 'predicting' // ML prediction running
  | 'attacking'  // Attacks executing
  | 'learning'   // Pattern extraction
```

### State Transitions

```
Start:
  idle → [user clicks Start Auto or Run Once] → scanning

Workflow:
  scanning → (autoAnalyze?) → analyzing → (hasResults?) → predicting
    ↓ (skip if disabled)        ↓ (skip if disabled)         ↓ (skip if no patterns)
  attacking → (autoLearn?) → learning → [cycle complete] → idle
    ↓ (skip if disabled)        ↓ (skip if disabled)
  
Continuous Mode:
  idle → [schedule timeout] → scanning → ... → idle → [repeat]

Error:
  any phase → [error occurs] → idle (with lastError set)

Stop:
  any phase → [user clicks Stop] → idle
```

### Persistence Strategy

```
Configuration: useKV('automation-config')
  - Persisted on every change
  - Loaded on component mount
  - Default values provided

Learned Patterns: useKV('learned-patterns')
  - Appended after learn phase
  - Never automatically deleted
  - User can clear manually

Attack History: useKV('attack-history')
  - Appended after each attack
  - Limited to last 100 entries
  - User can clear manually

Automation History: In-memory only
  - Not persisted between sessions
  - Cleared on component unmount
  - Limited to last 100 entries
```

## Concurrency Model

### Parallel Attack Execution

```javascript
async function executeAttackQueue(queue: AttackQueueItem[]) {
  const results: AttackHistory[] = []
  const maxConcurrent = config.maxConcurrentAttacks
  
  while (queue.length > 0) {
    // Take N items from queue
    const batch = queue.splice(0, maxConcurrent)
    
    // Execute batch in parallel
    const batchPromises = batch.map(attack => executeAttack(attack))
    const batchResults = await Promise.all(batchPromises)
    
    // Collect results
    results.push(...batchResults.filter(r => r !== null))
  }
  
  return results
}
```

### Concurrency Control

- **Web Workers**: Not used (attacks run in main thread)
- **Promise.all()**: Used for parallel execution
- **Batching**: Queue split into chunks of size N
- **Backpressure**: Naturally handled by await on Promise.all()
- **Cancellation**: Not currently supported (future enhancement)

## Error Handling

### Error Categories

1. **Configuration Errors**: Invalid settings (caught at UI)
2. **Network Errors**: RPC connection failures (retry logic)
3. **Scan Errors**: Block fetch failures (logged, continue)
4. **Analysis Errors**: Pattern detection failures (logged, skip)
5. **Attack Errors**: Lattice reduction failures (logged, continue)
6. **Learning Errors**: Pattern extraction failures (logged, skip)

### Error Recovery

```
Recoverable Errors:
  - RPC timeout → retry with exponential backoff
  - Invalid block → skip block, continue scan
  - Attack failure → log error, continue queue
  - Analysis failure → skip analysis phase

Non-Recoverable Errors:
  - Invalid RPC URL → stop engine, show error
  - Out of memory → stop engine, show error
  - Syntax error in config → stop engine, show error
```

### Error Logging

All errors are:
1. Logged to activity history with timestamp
2. Stored in state.lastError for display
3. Displayed via toast notification
4. Console.error() for debugging

## Performance Optimizations

### Implemented

- **Lazy State Updates**: Only update UI on significant changes
- **Batch Processing**: Process attacks in configurable batches
- **Priority Sorting**: O(n log n) sort once, not per-operation
- **Memoization**: Configuration changes memoized in useEffect
- **Selective Re-renders**: Components only re-render on relevant state changes

### Future Optimizations

- **Web Workers**: Offload LLL/BKZ to background thread
- **IndexedDB**: Move history storage from localStorage to IndexedDB
- **Streaming**: Stream scan results instead of batch loading
- **Caching**: Cache RPC responses for duplicate block queries
- **Debouncing**: Debounce metric updates during high-frequency operations

## Security Considerations

### Attack Surface

- **RPC Endpoints**: User-provided URLs (validated format only)
- **API Keys**: May be in RPC URLs (stored in localStorage)
- **Code Injection**: No eval() or dynamic code execution
- **XSS**: React escapes all user input automatically
- **CSRF**: Not applicable (no server-side state)

### Mitigations

- **Input Validation**: All numeric inputs validated at UI
- **Error Sanitization**: Error messages don't leak sensitive data
- **No External Dependencies**: Only calls RPC and optional GPT
- **Local Storage Only**: No data leaves browser (except RPC/GPT calls)
- **Read-Only Operations**: RPC scanner only reads blockchain

## Testing Strategy

### Unit Tests (Future)

- AutomationEngine methods
- Attack queue priority logic
- Pattern learning algorithms
- Lattice generation functions

### Integration Tests (Future)

- Full workflow cycle
- RPC scanner integration
- Batch analysis integration
- Pattern learning integration

### Manual Testing

Current testing approach:
1. Visual inspection of UI updates
2. Manual workflow execution
3. Metrics verification
4. Error scenario testing
5. Performance monitoring in DevTools

## Monitoring & Observability

### Metrics Collected

- Total blocks scanned
- Total weaknesses found
- Total attacks executed
- Successful attacks
- Success rate (calculated)
- Average execution time (via learned patterns)

### Logging

- Activity history (last 100 actions)
- Per-action details (block ranges, counts, errors)
- Timestamps for all events
- Success/failure status

### Future Enhancements

- Performance profiling
- Detailed timing breakdowns
- Memory usage tracking
- Network bandwidth monitoring
- Export to analytics platforms

## Conclusion

The automation architecture provides a robust, scalable foundation for autonomous cryptographic vulnerability research. The modular design allows for easy extension and modification while maintaining clean separation of concerns.
