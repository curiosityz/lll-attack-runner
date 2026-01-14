# Planning Guide

A sophisticated web application for analyzing cryptographic signatures and executing advanced lattice basis reduction attacks (LLL, BKZ). Users upload transaction/signature data dumps, the tool automatically detects vulnerabilities and patterns, then generates and executes targeted attacks.

**Experience Qualities**:
1. **Data-Driven** - Upload large signature datasets and get immediate, actionable intelligence about cryptographic weaknesses
2. **Professional** - Clean interface for security research with comprehensive analysis and automated attack generation
3. **Intelligent** - Automated pattern recognition across thousands of signatures with smart attack configuration

**Complexity Level**: Complex Application (advanced functionality with multiple views and intelligent analysis)
- This is a sophisticated security research tool with file upload parsing, multi-format data ingestion, comprehensive signature analysis, pattern clustering, automated attack generation, and visualization across multiple interconnected features.

## Essential Features

### LLL Attack Configuration
- **Functionality**: Configure lattice attack parameters including basis vectors, target values, and algorithm settings
- **Purpose**: Allows users to set up different types of cryptographic attacks (RSA, subset sum, knapsack, etc.)
- **Trigger**: User selects attack type and inputs parameters
- **Progression**: Select attack type → Input basis/target values → Configure delta parameter → Review configuration → Ready to run
- **Success criteria**: Valid mathematical input accepted, clear error messages for invalid configurations

### Attack Execution
- **Functionality**: Run LLL or BKZ algorithms on the configured lattice and display results
- **Purpose**: Perform lattice reduction with choice of algorithm strength
- **Trigger**: User clicks "Run Attack" button after selecting algorithm (LLL/BKZ) and parameters
- **Progression**: Select algorithm → Configure block size (BKZ) → Initiate computation → Show progress indicator → Display reduced basis → Highlight solution vector → Show attack success/failure with algorithm metrics
- **Success criteria**: Algorithm completes, results are mathematically sound, clear indication of attack success with algorithm details

### RPC Signature Scanner
- **Functionality**: Connect to Ethereum-compatible RPC nodes and scan transaction signatures for cryptographic weaknesses
- **Purpose**: Automatically detect real-world signature vulnerabilities (nonce reuse, bias, small r-values) in blockchain data
- **Trigger**: User enters RPC endpoint and block range, clicks "Scan for Weak Signatures"
- **Progression**: Enter RPC URL → Specify block range → Initiate scan → Monitor progress → Display detected weaknesses with severity → Click weakness to auto-generate lattice attack → Switch to Attack tab with pre-configured basis
- **Success criteria**: Successfully connects to RPC, scans blocks, identifies known weaknesses, generates valid lattice configurations for detected vulnerabilities

### Automated Attack Generation
- **Functionality**: Automatically construct lattice basis from detected signature weaknesses
- **Purpose**: Bridge gap between vulnerability detection and attack execution without manual lattice construction
- **Trigger**: User clicks "Generate Attack Configuration" on a detected weak signature
- **Progression**: Detect weakness → Analyze signature parameters → Construct appropriate lattice (HNP for bias, direct computation for reuse) → Pre-fill Attack tab → Ready to execute
- **Success criteria**: Generated lattice is mathematically correct for the weakness type, attack successfully recovers keys or demonstrates vulnerability

### Attack History
- **Functionality**: Store and display previous attack attempts with their parameters and results
- **Purpose**: Allow users to track experiments, compare results, and learn from past attempts
- **Trigger**: Automatically saved after each attack execution
- **Progression**: Attack completes → Save to history → View in history list → Click to restore configuration → Re-run or modify
- **Success criteria**: History persists between sessions, easy to navigate and restore previous attacks

### Automation Engine
- **Functionality**: Fully automated workflow orchestration from scanning to attack execution and pattern learning
- **Purpose**: Enable continuous vulnerability discovery and exploitation with zero manual intervention
- **Trigger**: User clicks "Run Once" for single cycle or "Start Auto" for continuous operation
- **Progression**: Configure RPC endpoint & scan parameters → Enable auto-analyze/attack/learn → Set priority threshold & concurrency → Start engine → Monitor real-time progress (scanning → analyzing → predicting → attacking → learning) → View metrics (blocks scanned, weaknesses found, attacks executed, success rate) → Review activity history → Examine learned patterns → Adjust configuration → Continue or stop
- **Success criteria**: Engine executes complete workflows autonomously, queues and prioritizes attacks intelligently, learns optimal parameters from successful attacks, runs continuously without errors, provides comprehensive activity logging

### Parallel Attack Execution
- **Functionality**: Execute multiple lattice reduction attacks simultaneously with configurable concurrency
- **Purpose**: Maximize throughput when processing multiple detected vulnerabilities
- **Trigger**: Automation engine detects multiple weaknesses and queues attacks
- **Progression**: Detect vulnerabilities → Prioritize by severity → Queue attacks → Execute up to N attacks in parallel → Monitor progress → Collect results → Update metrics
- **Success criteria**: Multiple attacks run concurrently without interference, results are correctly attributed, performance scales with concurrency setting

### Pattern Learning System
- **Functionality**: Automatically extract optimal attack parameters from successful executions
- **Purpose**: Build knowledge base of effective configurations for different problem structures
- **Trigger**: Automation engine completes attacks with auto-learn enabled
- **Progression**: Execute attacks → Identify successful ones → Group by problem size/structure → Calculate optimal delta, algorithm, and block size → Store learned patterns → Display pattern library → Apply patterns to similar future attacks
- **Success criteria**: Patterns accurately capture optimal settings, success rates and execution times are tracked, patterns inform future attack configurations

### Result Visualization
- **Functionality**: Display reduced basis vectors, solution vectors, and attack metrics in clear format
- **Purpose**: Help users understand the attack outcome and verify results
- **Trigger**: Attack execution completes
- **Progression**: Algorithm finishes → Parse results → Display vectors in matrix form → Highlight solution → Show quality metrics
- **Success criteria**: Results are readable, solution is clearly identified, metrics help assess attack quality

### Attack Templates
- **Functionality**: Pre-configured examples of common cryptographic attacks spanning 40+ scenarios across 8 categories (RSA, Subset Sum, Knapsack, CVP, HNP, NTRU, DSA, Custom)
- **Purpose**: Educational starting point, quick setup for standard scenarios, and comprehensive coverage of lattice-based cryptanalysis techniques
- **Trigger**: User selects from template library with category filtering
- **Progression**: Browse templates → Filter by category → Select template → View description and expected outcome → Load parameters → Modify if desired → Run
- **Success criteria**: Templates demonstrate various attack types with clear explanations, organized by category for easy navigation, covering beginner to advanced scenarios

### Matrix Visualization with D3
- **Functionality**: Interactive D3-based visualizations showing vector transformations during LLL reduction process
- **Purpose**: Educational tool to understand how the algorithm progressively reduces the lattice basis
- **Trigger**: User enables "Capture visualization steps" before running attack
- **Progression**: Enable capture → Run attack → View visualization tab → Scrub through timeline or play animation → Observe vector changes, swaps, and reductions → Analyze orthogonality/norm charts
- **Success criteria**: Smooth animations showing vector transformations, clear indication of swap vs reduce operations, synchronized matrix heatmap and progress charts

### Batch Signature Analysis
- **Functionality**: Analyze multiple scanned signatures simultaneously to detect cross-transaction patterns
- **Purpose**: Identify vulnerabilities that only appear when examining multiple signatures together (clusters, sequences, correlations)
- **Trigger**: User clicks "Run Batch Analysis" after scanning blocks with signatures
- **Progression**: Scan signatures → Run batch analysis → Detect pattern clusters → View statistical analysis → Generate attacks from clusters → Execute with optimal algorithm (LLL/BKZ) and parameters
- **Success criteria**: Detects nonce reuse clusters, sequential patterns, bit bias, temporal correlations, and address clustering with confidence scores and actionable recommendations

### ML Pattern Prediction
- **Functionality**: Machine learning system that predicts vulnerable blocks in unscanned ranges based on historical scan data
- **Purpose**: Intelligently prioritize scanning efforts by forecasting where vulnerabilities are most likely to occur
- **Trigger**: User navigates to ML Predictions tab and configures target block range
- **Progression**: Scan blocks (training data) → Configure prediction range → Generate ML predictions → View confidence scores and reasoning → Scan suggested high-priority blocks → Validate predictions
- **Success criteria**: Model trains on historical patterns, predicts vulnerability locations with confidence scores, provides reasoning for predictions, identifies high-priority blocks, and improves accuracy with more training data

## Edge Case Handling

- **Invalid Matrix Input**: Detect non-numeric, malformed, or non-square matrices and show inline validation errors
- **Singular Matrices**: Warn when basis is not linearly independent before running attack
- **Large Computations**: Show warning for high-dimension lattices or large BKZ block sizes that may take significant time
- **Empty History**: Display helpful empty state encouraging first attack
- **Numerical Overflow**: Handle very large integers gracefully, suggest scaling parameters
- **Failed Attacks**: Clearly distinguish between algorithm completion and attack success/failure
- **RPC Connection Failures**: Handle network errors, invalid endpoints, rate limits gracefully with clear error messages
- **Empty Signature Scans**: When no vulnerabilities found, show positive confirmation rather than error state
- **Invalid Block Ranges**: Validate block numbers and enforce maximum scan range (1000 blocks for scanning, 500 for predictions)
- **Insufficient Training Data**: ML predictions gracefully handle limited historical data and communicate confidence limitations
- **AI Enhancement Failures**: ML system falls back to statistical model if AI enhancement unavailable

## Design Direction

The design evokes precision, mathematical clarity, and cutting-edge sophistication. It feels like a professional security research tool with modern aesthetics - balancing dense technical information with visual breathing room. The interface uses a gradient-rich, layered design with subtle patterns, backdrop blur effects, and refined color accents that create depth and visual interest without overwhelming the complex data displays.

## Color Selection

A modern, sophisticated cybersecurity-inspired palette with vibrant accents and excellent contrast for readability of complex mathematical notation.

- **Primary Color**: Vibrant Purple (oklch(0.60 0.25 280)) - Represents computational power and technical sophistication
- **Secondary Colors**: Deep Slate (oklch(0.24 0.03 265)) for elevated surfaces with subtle transparency, creating layered depth
- **Accent Color**: Electric Cyan (oklch(0.72 0.18 190)) - High-energy highlights for interactive elements, results, and success states
- **Success Color**: Matrix Green (oklch(0.68 0.20 150)) - Clear positive feedback for successful operations
- **Warning Color**: Amber Alert (oklch(0.75 0.20 60)) - Attention-grabbing for important notices
- **Foreground/Background Pairings**: 
  - Background (Deep Navy oklch(0.14 0.03 260 / 0.95) with gradient and pattern overlay): Light text (oklch(0.97 0.01 260)) - Ratio 13.2:1 ✓
  - Primary (Vibrant Purple oklch(0.60 0.25 280)): White text (oklch(1 0 0)) - Ratio 5.8:1 ✓
  - Accent (Electric Cyan oklch(0.72 0.18 190)): Dark text (oklch(0.14 0.03 260)) - Ratio 10.8:1 ✓
  - Success (Matrix Green oklch(0.68 0.20 150)): Dark text (oklch(0.14 0.03 260)) - Ratio 9.2:1 ✓
  - Warning (Amber oklch(0.75 0.20 60)): Dark text (oklch(0.14 0.03 260)) - Ratio 11.5:1 ✓
  - Card surfaces use subtle gradient overlays (from-card/90 to-card/70) with backdrop-blur-sm for depth

## Font Selection

Typography emphasizes technical precision with excellent readability for mathematical notation and code-like content, using the distinctive JetBrains Mono throughout.

- **Typographic Hierarchy**:
  - H1 (Page Title): JetBrains Mono Bold/36px/tight letter-spacing with gradient text effect
  - H2 (Section Headers): JetBrains Mono Bold/20px with accent color bar indicators
  - H3 (Subsections): JetBrains Mono SemiBold/16px/normal letter-spacing
  - Body Text: JetBrains Mono Regular/14px/relaxed line-height (1.6)
  - Matrix/Vector Display: JetBrains Mono Regular/13px/monospace letter-spacing (0.02em)
  - Button Labels: JetBrains Mono Medium/15px/normal letter-spacing
  - Captions/Labels: JetBrains Mono Regular/12px with uppercase tracking for small labels

## Animations

Animations emphasize computational progression, state transitions, and mathematical transformations with smooth, purposeful motion.

- Button interactions use crisp state changes (150ms) with subtle scale transforms for tactile feedback
- Run Attack button features gradient animation and shadow effects on hover
- Attack execution shows smooth pulsing spinner with modern styling
- Results cards slide in with gentle spring animation (400ms ease-out) after computation
- Matrix transformations highlight changed vectors with color transitions
- Success states show satisfying scale and glow effects (250ms)
- History items fade in with stagger effect (50ms between items) for smooth reveals
- Tab transitions use crossfade with smooth state preservation
- Cards have smooth border color and shadow transitions on hover (200ms)
- Empty states feature gentle floating animations on icons
- D3 visualizations use fluid transitions (500ms) for vector transformations
- Progress indicators grow smoothly with easing curves

## Component Selection

- **Components**: 
  - Tabs with modern styling (rounded, backdrop-blur, active state with gradient backgrounds)
  - Card with glassmorphism effects (backdrop-blur-sm, gradient borders, subtle shadows)
  - Button with vibrant gradient backgrounds for primary actions, outline variants with colored borders for secondary
  - Textarea for matrix input with monospace styling and focus glow
  - Input for numeric parameters with enhanced focus states
  - Select for dropdowns with consistent styling
  - Badge with semantic color schemes (success, warning, destructive) using transparent backgrounds
  - Separator for dividing sections with subtle coloring
  - ScrollArea for history and large displays with custom scrollbar styling
  - Dialog for templates with modern backdrop
  - Alert with appropriate semantic coloring and improved typography
  - Progress bars with gradient fills and smooth animations
  
- **Customizations**:
  - Enhanced Card components with gradient overlays and refined borders
  - VectorDisplay with improved visual hierarchy and metric displays
  - AttackCard with structured metric panels and status indicators
  - Empty states with large icons, clear messaging, and call-to-action buttons
  - Header with gradient text effects and icon badging
  - Help section with colored accent bars for visual categorization
  - Metric displays using rounded containers with subtle backgrounds
  
- **States**:
  - Buttons: Default (gradient primary to accent), hover (intensified gradient with shadow), active (scale down), disabled (muted), loading (spinner with gradient border)
  - Inputs: Default (border with transparency), focus (accent border with glow), error (destructive border), success (success border)
  - Cards: Default (subtle border), hover (enhanced border color and shadow for interactive cards)
  - Results: Computing (pulsing animation), success (green accent with glow), failure/warning (amber accent)
  
- **Icon Selection** (using Phosphor Icons with duotone weight):
  - Play icon for "Run Attack" and playback controls
  - SkipForward/SkipBack for stepping through visualization frames
  - ClockClockwise for re-run from history
  - X for clear/delete actions
  - ListBullets for history view
  - Lightbulb for templates/help
  - ArrowsClockwise for algorithm iterations
  - CheckCircle for successful attacks
  - XCircle for failed attacks
  - Calculator for mathematical operations
  - ChartLine for visualization tab
  
- **Spacing**:
  - Container padding: p-6 (24px) for main panels
  - Section gaps: gap-6 (24px) between major sections
  - Element gaps: gap-4 (16px) between form elements
  - Inline spacing: gap-2 (8px) for button groups and inline elements
  - Card padding: p-5 (20px) for content cards
  
- **Mobile**:
  - Stack attack config and results vertically on mobile
  - Tabs convert to full-width stacked buttons below 768px
  - Matrix input gets larger touch-friendly text area
  - History cards become full-width with simplified display
  - Reduce padding to p-4 on mobile
  - Parameters stack vertically instead of grid layout
  - Visualization controls stack vertically with larger touch targets
  - D3 charts use responsive viewBox for mobile scaling
  - Playback speed selector reduces to 2 options on mobile
