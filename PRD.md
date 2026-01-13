# Planning Guide

An interactive web application for running LLL (Lenstra-Lenstra-Lovász) lattice basis reduction attacks on cryptographic problems, with visual feedback and educational context.

**Experience Qualities**:
1. **Precise** - The interface should convey technical accuracy and mathematical rigor appropriate for cryptographic analysis
2. **Educational** - Users should understand the attack process through clear visualization and step-by-step feedback
3. **Powerful** - The tool should feel capable and professional, suitable for both learning and research purposes

**Complexity Level**: Light Application (multiple features with basic state)
- This is a specialized tool with multiple attack vectors, input methods, and result visualization, but doesn't require complex multi-view navigation or advanced state management beyond storing attack history.

## Essential Features

### LLL Attack Configuration
- **Functionality**: Configure lattice attack parameters including basis vectors, target values, and algorithm settings
- **Purpose**: Allows users to set up different types of cryptographic attacks (RSA, subset sum, knapsack, etc.)
- **Trigger**: User selects attack type and inputs parameters
- **Progression**: Select attack type → Input basis/target values → Configure delta parameter → Review configuration → Ready to run
- **Success criteria**: Valid mathematical input accepted, clear error messages for invalid configurations

### Attack Execution
- **Functionality**: Run the LLL algorithm on the configured lattice and display results
- **Purpose**: Perform the actual lattice reduction and find short vectors
- **Trigger**: User clicks "Run Attack" button after configuration
- **Progression**: Initiate computation → Show progress indicator → Display reduced basis → Highlight solution vector → Show attack success/failure
- **Success criteria**: Algorithm completes, results are mathematically sound, clear indication of attack success

### Attack History
- **Functionality**: Store and display previous attack attempts with their parameters and results
- **Purpose**: Allow users to track experiments, compare results, and learn from past attempts
- **Trigger**: Automatically saved after each attack execution
- **Progression**: Attack completes → Save to history → View in history list → Click to restore configuration → Re-run or modify
- **Success criteria**: History persists between sessions, easy to navigate and restore previous attacks

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

## Edge Case Handling

- **Invalid Matrix Input**: Detect non-numeric, malformed, or non-square matrices and show inline validation errors
- **Singular Matrices**: Warn when basis is not linearly independent before running attack
- **Large Computations**: Show warning for high-dimension lattices that may take significant time
- **Empty History**: Display helpful empty state encouraging first attack
- **Numerical Overflow**: Handle very large integers gracefully, suggest scaling parameters
- **Failed Attacks**: Clearly distinguish between algorithm completion and attack success/failure

## Design Direction

The design should evoke precision, mathematical clarity, and technical sophistication. It should feel like a professional research tool while remaining approachable for learners. The interface should balance dense information display with breathing room, using monospace fonts for mathematical data and clear visual hierarchy to guide users through the attack process.

## Color Selection

A technical, cybersecurity-inspired palette with high contrast for readability of complex mathematical notation.

- **Primary Color**: Deep Electric Blue (oklch(0.45 0.20 250)) - Represents analytical thinking and technical precision
- **Secondary Colors**: Dark Slate (oklch(0.25 0.02 260)) for panels and containers, providing a sophisticated backdrop
- **Accent Color**: Neon Cyan (oklch(0.75 0.15 200)) - High-visibility highlights for active elements and successful attacks
- **Foreground/Background Pairings**: 
  - Background (Dark Slate #1a1d2e oklch(0.15 0.02 260)): Light Gray text (oklch(0.95 0 0)) - Ratio 12.8:1 ✓
  - Primary (Electric Blue oklch(0.45 0.20 250)): White text (oklch(1 0 0)) - Ratio 5.2:1 ✓
  - Accent (Neon Cyan oklch(0.75 0.15 200)): Dark text (oklch(0.15 0.02 260)) - Ratio 11.5:1 ✓
  - Success state: Matrix Green (oklch(0.65 0.18 145)) with dark text - Ratio 6.8:1 ✓
  - Error state: Alert Red (oklch(0.60 0.22 25)) with white text - Ratio 4.9:1 ✓

## Font Selection

Typography should emphasize technical precision with excellent readability for mathematical notation and code-like content.

- **Typographic Hierarchy**:
  - H1 (Page Title): JetBrains Mono Bold/32px/tight letter-spacing (-0.02em)
  - H2 (Section Headers): JetBrains Mono SemiBold/24px/normal letter-spacing
  - H3 (Subsections): JetBrains Mono Medium/18px/normal letter-spacing
  - Body Text: JetBrains Mono Regular/14px/relaxed line-height (1.6)
  - Matrix/Vector Display: JetBrains Mono Regular/13px/monospace letter-spacing (0.02em)
  - Button Labels: JetBrains Mono Medium/14px/normal letter-spacing
  - Captions/Labels: JetBrains Mono Regular/12px/normal letter-spacing

## Animations

Animations should emphasize computational progression and mathematical transformations, reinforcing the algorithmic nature of the tool.

- Button interactions use quick, crisp state changes (100ms) to feel responsive
- Attack execution shows a subtle pulsing indicator during computation
- Results slide in with a gentle ease-out transition (300ms) after computation
- Matrix transformations can show a brief highlight flash on changed vectors
- Success states get a satisfying scale-up confirmation (200ms)
- History items fade in sequentially with stagger effect when viewing list
- Tab transitions use smooth crossfade to maintain context
- D3 visualizations use smooth transitions (400-600ms) when stepping through algorithm iterations
- Vector movements in 2D plot follow natural easing curves to show transformations
- Heatmap cells transition colors smoothly when matrix values change
- Progress charts draw paths with animated line growth from left to right

## Component Selection

- **Components**: 
  - Tabs (attack configuration, visualization, history, help) for main navigation
  - Card for containing attack setup panel, results display, visualization panels, and history items
  - Button with variants (default for run, outline for templates, destructive for clear)
  - Textarea for matrix input with monospace styling
  - Input for numeric parameters (delta value, dimension)
  - Select for attack type dropdown
  - Badge for attack status indicators (success, failed, running) and action types (swap, reduce)
  - Separator for dividing sections within panels
  - ScrollArea for history list and large result displays
  - Dialog for template selection with descriptions
  - Alert for warnings about computation time or invalid input
  - Checkbox for enabling visualization capture
  - Slider for scrubbing through visualization timeline
  - D3 SVG components for vector plots, matrix heatmaps, and progress charts
  
- **Customizations**:
  - Custom MatrixInput component combining Textarea with validation and formatting helpers
  - Custom VectorDisplay component for rendering mathematical vectors with highlighting
  - Custom AttackCard component wrapping Card with specific layout for history items
  - Custom VectorVisualization component with D3 for interactive 2D vector plots and norm bar charts
  - Custom MatrixHeatmap component with D3 for color-coded matrix state visualization
  - Custom OrthogonalityChart component with D3 for dual-axis progress tracking
  
- **States**:
  - Buttons: Default (electric blue), hover (brighter blue with subtle glow), active (pressed with scale), disabled (muted with reduced opacity), loading (with spinner)
  - Inputs: Default (dark with cyan border), focus (brighter cyan border with glow), error (red border), success (green border)
  - Results: Computing (pulsing skeleton), success (green accent), failure (amber accent)
  
- **Icon Selection**:
  - Play icon for "Run Attack" button and playback controls
  - Pause icon for stopping animation playback
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
