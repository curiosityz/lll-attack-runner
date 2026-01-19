import { useState } from 'react'
import { useKV } from '@github/spark/hooks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Play, Lightbulb, Calculator, ListBullets, ChartLine, UploadSimple, Database, Function, Lightning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { AttackHistory, AttackType, AttackTemplate, LLLStep, AlgorithmType } from '@/lib/types'
import { runLLL, parseBasisFromString } from '@/lib/lll'
import { runBKZ } from '@/lib/bkz'
import { runPrecisionLLL, runPrecisionBKZ } from '@/lib/precision-wrapper'
import { MatrixInput } from '@/components/MatrixInput'
import { VectorDisplay } from '@/components/VectorDisplay'
import { AttackCard } from '@/components/AttackCard'
import { TemplateDialog } from '@/components/TemplateDialog'
import { VectorVisualization } from '@/components/VectorVisualization'
import { MatrixHeatmap } from '@/components/MatrixHeatmap'
import { OrthogonalityChart } from '@/components/OrthogonalityChart'
import { DataUpload } from '@/components/DataUpload'
import { BlockchairUpload } from '@/components/BlockchairUpload'
import { AnalysisDisplay } from '@/components/AnalysisDisplay'
import { AddressLookup } from '@/components/AddressLookup'
import { BlockchainExplorerIntegration } from '@/components/BlockchainExplorerIntegration'
import { SighashCalculator } from '@/components/SighashCalculator'
import { ParsedSignature, ParseResult } from '@/lib/dataParser'
import { analyzeSignatures, AnalysisResult, WeakSignature, PatternCluster } from '@/lib/signatureAnalyzer'
import { ExtractedSignature } from '@/lib/blockchair-parser'
import { ExplorerTransaction } from '@/lib/blockchain-explorer'
import { extractPrivateKeyFromAttack, PrivateKeyResult } from '@/lib/privateKeyExtractor'
import { PrivateKeyDisplay } from '@/components/PrivateKeyDisplay'
import { PrecisionIndicator, PrecisionWarning } from '@/components/PrecisionIndicator'
import { LargeDimensionInfo } from '@/components/LargeDimensionInfo'
import { DimensionGuidance } from '@/components/DimensionGuidance'
import { SignatureRequirementInfo } from '@/components/SignatureRequirementInfo'
import { SaturationWarning } from '@/components/SaturationWarning'
import { CORSExplanation } from '@/components/CORSExplanation'
import { buildHNPLatticeWithDimensionSelection, BatchHNPLatticeResult } from '@/lib/hnp-lattice-builder'
import { interpretBKZResult, InterpreterResult, isKeyFound, getRetryRecommendation } from '@/lib/result-interpreter'
import { DimensionSelectorDisplay } from '@/components/DimensionSelectorDisplay'
import { selectDimension, DimensionSelectionResult } from '@/lib/dimension-selector'
import { DatabaseConfigPanel } from '@/components/DatabaseConfigPanel'
import { getDatabaseClient } from '@/lib/database-client'
import { BlockchairDataImport } from '@/components/BlockchairDataImport'
import { UrlListStreamToD1 } from '@/components/UrlListStreamToD1'
import { UnifiedAttackRunner } from '@/components/UnifiedAttackRunner'

/**
 * Converts a BigInt matrix to a number matrix for display and processing.
 * Large values are scaled down to prevent overflow while preserving relative proportions.
 */
function convertBigIntBasisToNumber(basis: bigint[][]): number[][] {
  // Find the maximum absolute value in the matrix
  let maxVal = 1n
  for (const row of basis) {
    for (const val of row) {
      const absVal = val < 0n ? -val : val
      if (absVal > maxVal) {
        maxVal = absVal
      }
    }
  }
  
  // If values fit in safe integer range, convert directly
  const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)
  if (maxVal <= MAX_SAFE) {
    return basis.map(row => row.map(val => Number(val)))
  }
  
  // Scale down large values to prevent precision loss
  // Use ceiling division to minimize information loss: (maxVal + MAX_SAFE - 1) / MAX_SAFE
  const scaleFactor = (maxVal + MAX_SAFE - 1n) / MAX_SAFE
  return basis.map(row => 
    row.map(val => Number(val / scaleFactor))
  )
}

/**
 * Formats a matrix for display, handling both number and bigint matrices.
 */
function formatMatrixForDisplay(basis: number[][] | bigint[][]): string {
  return basis.map(row => 
    row.map(val => {
      if (typeof val === 'bigint') {
        return val.toString()
      }
      if (Math.abs(val) < 1e10 && Number.isInteger(val)) {
        return val.toString()
      }
      return Math.round(val).toString()
    }).join(' ')
  ).join('\n')
}

function App() {
  const [attackHistory, setAttackHistory] = useKV<AttackHistory[]>('attack-history', [])
  
  const [attackType, setAttackType] = useState<AttackType>('custom')
  const [attackName, setAttackName] = useState('Custom Attack')
  const [basisInput, setBasisInput] = useState('1 2 3\n4 5 6\n7 8 9')
  const [delta, setDelta] = useState('0.75')
  const [algorithm, setAlgorithm] = useState<AlgorithmType>('lll')
  const [blockSize, setBlockSize] = useState('10')
  const [isRunning, setIsRunning] = useState(false)
  const [captureVisualization, setCaptureVisualization] = useState(false)
  const [visualizationSteps, setVisualizationSteps] = useState<LLLStep[]>([])
  const [currentVisualizationStep, setCurrentVisualizationStep] = useState(0)
  const [result, setResult] = useState<{
    reducedBasis: number[][]
    iterations: number
    executionTime: number
    success: boolean
    solutionVector?: number[]
    algorithm?: AlgorithmType
    blockSize?: number
    usedHighPrecision?: boolean
    originalScale?: bigint
  } | null>(null)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  
  const [uploadedSignatures, setUploadedSignatures] = useState<ParsedSignature[]>([])
  const [blockchairRawSignatures, setBlockchairRawSignatures] = useState<ExtractedSignature[]>([])
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [activeTab, setActiveTab] = useState('upload')
  const [privateKeyResult, setPrivateKeyResult] = useState<PrivateKeyResult | null>(null)
  const [currentAttackSignatures, setCurrentAttackSignatures] = useState<ParsedSignature[]>([])
  const [currentWeaknessType, setCurrentWeaknessType] = useState<string>('')
  const [isNormalized, setIsNormalized] = useState(false)
  const [usePrecisionMode, setUsePrecisionMode] = useState(true)
  const [attackProgress, setAttackProgress] = useState<string>('')
  const [interpreterResult, setInterpreterResult] = useState<InterpreterResult | null>(null)
  const [showMatrixDetails, setShowMatrixDetails] = useState(false)
  const [targetAddress, setTargetAddress] = useState<string>('')
  const [dimensionSelectionResult, setDimensionSelectionResult] = useState<DimensionSelectionResult | null>(null)
  const [batchResults, setBatchResults] = useState<BatchHNPLatticeResult | null>(null)
  const [dbStreamingEnabled, setDbStreamingEnabled] = useKV<boolean>('database-streaming-enabled', false)

  const handleAddressAttack = (address: string, basis: number[][], attackName: string) => {
    const dimension = basis.length
    const isLargeLattice = dimension >= 40
    const isMediumLattice = dimension >= 20 && dimension < 40
    
    setAttackType('signature-scan')
    setAttackName(attackName)
    setBasisInput(formatMatrixForDisplay(basis))
    setAlgorithm('bkz')
    
    if (isLargeLattice) {
      setBlockSize('25')
      setDelta('0.99')
      setIsNormalized(true)
      toast.success('High-dimensional attack loaded!', {
        description: `${dimension}D lattice from real signatures - ready for key extraction`
      })
    } else if (isMediumLattice) {
      setBlockSize('22')
      setDelta('0.99')
      setIsNormalized(true)
      toast.warning('Medium lattice configured', {
        description: `${dimension}D - may find patterns but need 40+ for reliable key extraction`
      })
    } else {
      setBlockSize('20')
      setDelta('0.99')
      setIsNormalized(dimension >= 4)
      toast.warning('Low-dimensional lattice', {
        description: `Only ${dimension}D - will likely find noise. Need 40+ signatures.`
      })
    }
    
    setResult(null)
    setVisualizationSteps([])
    setCurrentAttackSignatures([])
    setCurrentWeaknessType('biased-k')
    setActiveTab('attack')
  }

  const handleExplorerTransactions = (transactions: ExplorerTransaction[]) => {
    console.log('Fetched transactions:', transactions)
  }

  const handleExplorerSignatures = (signatures: Array<{
    r: string
    s: string
    z: string
    txid: string
    blockNumber: number
    timestamp: number
  }>) => {
    const parsedSignatures: ParsedSignature[] = signatures.map((sig) => ({
      r: BigInt(sig.r),
      s: BigInt(sig.s),
      v: 27,
      hash: sig.z,
      address: 'explorer-' + sig.txid.slice(0, 10),
      timestamp: sig.timestamp,
      blockNumber: sig.blockNumber,
      txNonce: 0
    }))

    setUploadedSignatures(parsedSignatures)
    setIsAnalyzing(true)
    
    setTimeout(() => {
      const result = analyzeSignatures(parsedSignatures)
      setAnalysisResult(result)
      setIsAnalyzing(false)
      
      if (result.weakSignatures.length > 0 || result.patterns.length > 0) {
        toast.success('Explorer analysis complete!', {
          description: `Found ${result.weakSignatures.length} weaknesses and ${result.patterns.length} patterns`
        })
        setActiveTab('analyze')
      }
    }, 500)
  }

  const handleDataParsed = (signatures: ParsedSignature[], parseResult: ParseResult) => {
    setUploadedSignatures(signatures)
    setIsAnalyzing(true)
    
    // Stream to database if enabled
    if (dbStreamingEnabled && signatures.length > 0) {
      const dbClient = getDatabaseClient()
      dbClient.streamParsedSignatures(signatures).then(result => {
        if (result.success) {
          toast.success(`Streamed ${result.count} signatures to database`)
        } else if (result.errors.length > 0) {
          toast.error(`Database streaming error: ${result.errors[0]}`)
        }
      }).catch(err => {
        toast.error(`Database streaming failed: ${err.message}`)
      })
    }
    
    setTimeout(() => {
      const result = analyzeSignatures(signatures)
      setAnalysisResult(result)
      
      // Run dimension selection analysis
      const dimSelection = selectDimension(signatures)
      setDimensionSelectionResult(dimSelection)
      
      setIsAnalyzing(false)
      
      if (result.weakSignatures.length > 0 || result.patterns.length > 0) {
        toast.success('Analysis complete!', {
          description: `Found ${result.weakSignatures.length} weaknesses and ${result.patterns.length} patterns`
        })
      }
      
      // Show dimension selection info
      if (dimSelection.isValid) {
        if (dimSelection.batchCount > 1) {
          toast.info('Batch mode enabled', {
            description: `${signatures.length} signatures split into ${dimSelection.batchCount} batches of ~${dimSelection.batches[0]?.length || 80} for parallel attacks`
          })
        }
      } else {
        toast.warning('Insufficient data for attack', {
          description: dimSelection.insufficientDataReason
        })
      }
    }, 500)
  }

  const handleBlockchairSignatures = (signatures: ParsedSignature[], rawSignatures: ExtractedSignature[]) => {
    setUploadedSignatures(signatures)
    setBlockchairRawSignatures(rawSignatures)
    setIsAnalyzing(true)
    
    // Stream to database if enabled
    if (dbStreamingEnabled && rawSignatures.length > 0) {
      const dbClient = getDatabaseClient()
      dbClient.streamSignatures(rawSignatures).then(result => {
        if (result.success) {
          toast.success(`Streamed ${result.count} signatures to database`)
        } else if (result.errors.length > 0) {
          toast.error(`Database streaming error: ${result.errors[0]}`)
        }
      }).catch(err => {
        toast.error(`Database streaming failed: ${err.message}`)
      })
    }
    
    setTimeout(() => {
      const result = analyzeSignatures(signatures)
      setAnalysisResult(result)
      setIsAnalyzing(false)
      
      // Count vulnerabilities from raw Blockchair data
      const vulnCount = rawSignatures.filter(s => s.vulnerabilities.length > 0).length
      
      if (result.weakSignatures.length > 0 || result.patterns.length > 0 || vulnCount > 0) {
        toast.success('Blockchair analysis complete!', {
          description: `Found ${result.weakSignatures.length + vulnCount} weaknesses and ${result.patterns.length} patterns`
        })
        setActiveTab('analyze')
      }
    }, 500)
  }
  
  const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
  
  const generateAttackFromWeakness = (weakness: WeakSignature) => {
    let basis: number[][]
    let name: string
    let algo: AlgorithmType = 'lll'
    let bSize = 10
    
    if (weakness.weakness === 'nonce-reuse' && weakness.relatedSignatures && weakness.relatedSignatures.length > 0) {
      const sig1 = weakness.signature
      const sig2 = weakness.relatedSignatures[0]
      
      const r1 = sig1.r
      const s1 = sig1.s
      const s2 = sig2.s
      
      const scale = 1000000n
      const r1_scaled = Number(r1 / scale)
      const s1_scaled = Number(s1 / scale)
      const s2_scaled = Number(s2 / scale)
      
      basis = [
        [r1_scaled, 0, 0],
        [s1_scaled, 1, 0],
        [s2_scaled, 0, 1]
      ]
      name = `Nonce Reuse Attack - ${sig1.hash.slice(0, 10)}`
      algo = 'lll'
      
      setCurrentAttackSignatures([sig1, sig2, ...(weakness.relatedSignatures || [])])
      setCurrentWeaknessType('nonce-reuse')
      setIsNormalized(false)
      
    } else if (weakness.weakness === 'biased-k' || weakness.weakness === 'similar-k') {
      const relatedSigs = [weakness.signature, ...(weakness.relatedSignatures || [])]
      const sigs = relatedSigs.slice(0, Math.min(relatedSigs.length, 500)) // Allow more signatures for batching
      
      // Use intelligent dimension selection
      const batchResult = buildHNPLatticeWithDimensionSelection(sigs)
      setDimensionSelectionResult(batchResult.dimensionSelection)
      setBatchResults(batchResult)
      
      if (!batchResult.isValid) {
        toast.error('Insufficient Data', {
          description: batchResult.insufficientDataReason || 'Not enough signatures for attack'
        })
        
        // Set up a minimal display for insufficient data case
        basis = [[1]]
        name = `HNP Attack - INSUFFICIENT DATA (${sigs.length} sigs, need ${batchResult.dimensionSelection.minRequiredRows})`
        algo = 'bkz'
        bSize = 10
        setCurrentAttackSignatures(sigs)
        setCurrentWeaknessType(weakness.weakness)
        setIsNormalized(true)
      } else {
        // Use the first batch for display, attacks will run on all batches
        const firstBatch = batchResult.batches[0]
        basis = convertBigIntBasisToNumber(firstBatch.basis)
        
        const dimension = batchResult.dimensionSelection.selectedDimension
        const biasBits = batchResult.dimensionSelection.expectedBiasBits
        
        if (batchResult.dimensionSelection.batchCount > 1) {
          name = `HNP BATCH - ${weakness.weakness} (${batchResult.dimensionSelection.batchCount} batches, ${dimension}D, ${biasBits}bit bias)`
        } else {
          name = `HNP ${firstBatch.metadata.latticeType.toUpperCase()} - ${weakness.weakness} (${sigs.length} sigs, ${dimension}D)`
        }
        
        algo = 'bkz'
        bSize = batchResult.recommendedBlockSize
        
        setCurrentAttackSignatures(sigs)
        setCurrentWeaknessType(weakness.weakness)
        setIsNormalized(true)
        
        if (batchResult.dimensionSelection.batchCount > 1) {
          toast.success('Batch attack configured!', {
            description: `${sigs.length} signatures → ${batchResult.dimensionSelection.batchCount} parallel batches of ${dimension}×${dimension}`
          })
        } else if (dimension >= 40) {
          toast.success('High-dimensional attack configured', {
            description: `${dimension}×${dimension} lattice built from ${sigs.length} signatures`
          })
        } else {
          toast.info('Attack configured', {
            description: `Using ${sigs.length} signatures • ${dimension}D lattice`
          })
        }
      }
      
    } else if (weakness.weakness === 'small-r') {
      const r_num = Number(weakness.signature.r)
      const s_num = Number(weakness.signature.s)
      
      basis = [
        [r_num, 0],
        [s_num, 1]
      ]
      name = `Small R Attack - ${weakness.signature.hash.slice(0, 10)}`
      algo = 'lll'
      
      setCurrentAttackSignatures([weakness.signature])
      setCurrentWeaknessType('small-r')
      setIsNormalized(false)
      
    } else {
      const scale = 1000000n
      const r_scaled = Number(weakness.signature.r / scale)
      const s_scaled = Number(weakness.signature.s / scale)
      
      basis = [
        [r_scaled, 0],
        [s_scaled, 1]
      ]
      name = `Generic Attack - ${weakness.weakness}`
      algo = 'lll'
      
      setCurrentAttackSignatures([weakness.signature])
      setCurrentWeaknessType(weakness.weakness)
      setIsNormalized(false)
    }
    
    setAttackType('signature-scan')
    setAttackName(name)
    setBasisInput(formatMatrixForDisplay(basis))
    setAlgorithm(algo)
    setBlockSize(bSize.toString())
    setResult(null)
    setVisualizationSteps([])
    setPrivateKeyResult(null)
    
    toast.success('Attack configured!', {
      description: `Ready to run ${algo.toUpperCase()} attack`
    })
  }
  
  const generateAttackFromPattern = (pattern: PatternCluster) => {
    let basis: number[][]
    let name: string
    let algo: AlgorithmType = 'bkz'
    let bSize = 20
    
    if (pattern.type === 'nonce-reuse') {
      const sigs = pattern.signatures.slice(0, 40)
      const scale = 100000n
      
      const rows = sigs.map((sig, idx) => {
        const r = Number(sig.r / scale)
        const s = Number(sig.s / scale)
        const row = new Array(sigs.length + 1).fill(0)
        row[0] = r
        row[idx + 1] = s
        return row
      })
      
      basis = rows
      name = `Cluster Attack - Nonce Reuse (${sigs.length} sigs)`
      algo = 'bkz'
      bSize = Math.min(sigs.length + 5, 30)
      
      setCurrentAttackSignatures(sigs)
      setCurrentWeaknessType('nonce-reuse')
      setIsNormalized(false)
      
    } else if (pattern.type === 'sequential') {
      const sigs = pattern.signatures.slice(0, 45)
      const scale = 10n ** 60n
      const n_scaled = Number(SECP256K1_N / scale)
      
      const maxSafe = 2 ** 26
      const normFactor = n_scaled / maxSafe
      const n_norm = Math.floor(n_scaled / normFactor)
      const bound = Math.floor(Math.sqrt(n_norm))
      
      basis = sigs.map((sig, idx) => {
        const r = Math.floor(Number(sig.r / scale) / normFactor)
        const s = Math.floor(Number(sig.s / scale) / normFactor)
        const row = new Array(sigs.length + 1).fill(0)
        row[0] = r
        row[idx + 1] = bound
        return row
      })
      
      name = `Sequential Pattern Attack (${sigs.length} sigs)`
      algo = 'bkz'
      bSize = Math.min(25, Math.ceil(sigs.length / 2))
      
      setCurrentAttackSignatures(sigs)
      setCurrentWeaknessType('sequential-k')
      setIsNormalized(true)
      
    } else if (pattern.type === 'biased-lsb' || pattern.type === 'biased-msb') {
      const maxSigs = 500 // Allow more signatures for batching
      const sigs = pattern.signatures.slice(0, maxSigs)
      
      // Determine expected bias bits from pattern metadata
      // MSB leak typically reveals ~8 bits, LSB bias is estimated from metadata or defaults to 4
      const DEFAULT_MSB_BIAS_BITS = 8
      const BIAS_MULTIPLIER = 10
      const DEFAULT_BIAS_BITS = 4
      const expectedBiasBits = pattern.type === 'biased-msb' 
        ? DEFAULT_MSB_BIAS_BITS
        : (pattern.metadata?.bias ? Math.floor(pattern.metadata.bias * BIAS_MULTIPLIER) : DEFAULT_BIAS_BITS)
      
      // Use intelligent dimension selection
      const batchResult = buildHNPLatticeWithDimensionSelection(sigs, { expectedBiasBits })
      setDimensionSelectionResult(batchResult.dimensionSelection)
      setBatchResults(batchResult)
      
      if (!batchResult.isValid) {
        toast.error('Insufficient Data', {
          description: batchResult.insufficientDataReason || 'Not enough signatures for attack'
        })
        
        // Set up a minimal display
        basis = [[1]]
        name = `HNP Attack - INSUFFICIENT DATA (${sigs.length} sigs, need ${batchResult.dimensionSelection.minRequiredRows})`
        algo = 'bkz'
        bSize = 10
        setCurrentAttackSignatures(sigs)
        setCurrentWeaknessType('biased-k')
        setIsNormalized(true)
      } else {
        const firstBatch = batchResult.batches[0]
        basis = convertBigIntBasisToNumber(firstBatch.basis)
        
        const dimension = batchResult.dimensionSelection.selectedDimension
        const biasBits = batchResult.dimensionSelection.expectedBiasBits
        
        if (batchResult.dimensionSelection.batchCount > 1) {
          name = `HNP BATCH - ${pattern.type.toUpperCase()} (${batchResult.dimensionSelection.batchCount} batches, ${dimension}D, ${biasBits}bit bias)`
        } else {
          name = `HNP ${firstBatch.metadata.latticeType.toUpperCase()} - ${pattern.type.toUpperCase()} (${sigs.length} sigs, ${dimension}D)`
        }
        
        algo = 'bkz'
        bSize = batchResult.recommendedBlockSize
        
        setCurrentAttackSignatures(sigs)
        setCurrentWeaknessType('biased-k')
        setIsNormalized(true)
        
        if (batchResult.dimensionSelection.batchCount > 1) {
          toast.success('Batch attack configured!', {
            description: `${sigs.length} signatures → ${batchResult.dimensionSelection.batchCount} parallel batches of ${dimension}×${dimension}`
          })
        } else if (dimension >= 40) {
          toast.success('High-dimensional lattice constructed', {
            description: `${dimension}×${dimension} • ${sigs.length} sigs • ${firstBatch.metadata.estimatedComplexity}`
          })
        } else {
          toast.info('Attack configured', {
            description: `Using ${sigs.length} signatures • ${dimension}D lattice`
          })
        }
      }
      
    } else {
      const sigs = pattern.signatures.slice(0, 4)
      const scale = 1000000n
      
      basis = sigs.map(sig => {
        const r = Number(sig.r / scale)
        const s = Number(sig.s / scale)
        return [r, s]
      })
      name = `Pattern Attack - ${pattern.type}`
      algo = 'bkz'
      bSize = 15
      
      setCurrentAttackSignatures(sigs)
      setCurrentWeaknessType(pattern.type)
      setIsNormalized(false)
    }
    
    setAttackType('signature-scan')
    setAttackName(name)
    setBasisInput(formatMatrixForDisplay(basis))
    setAlgorithm(algo)
    setBlockSize(bSize.toString())
    setDelta('0.99')
    setResult(null)
    setVisualizationSteps([])
    setPrivateKeyResult(null)
    
    toast.success('Pattern attack configured!', {
      description: `Using ${algo.toUpperCase()} with block size ${bSize}`
    })
  }
  
  const handleGenerateAttack = (item: WeakSignature | PatternCluster, type: 'weakness' | 'pattern') => {
    if (type === 'weakness') {
      generateAttackFromWeakness(item as WeakSignature)
    } else {
      generateAttackFromPattern(item as PatternCluster)
    }
  }

  const handleRunAttack = async () => {
    const basis = parseBasisFromString(basisInput)
    if (!basis) {
      toast.error('Invalid matrix format')
      return
    }

    const deltaValue = parseFloat(delta)
    if (isNaN(deltaValue) || deltaValue <= 0.25 || deltaValue >= 1) {
      toast.error('Delta must be between 0.25 and 1')
      return
    }

    setIsRunning(true)
    setResult(null)
    setVisualizationSteps([])
    setPrivateKeyResult(null)
    setInterpreterResult(null)
    setAttackProgress('Attacking...')

    await new Promise(resolve => setTimeout(resolve, 100))

    const startTime = performance.now()
    const dimension = basis.length
    
    setAttackProgress(`Running ${algorithm.toUpperCase()} on ${dimension}×${dimension} matrix...`)
    
    let lllResult: any
    
    try {
      if (usePrecisionMode) {
        if (algorithm === 'bkz') {
          const blockSizeValue = parseInt(blockSize)
          if (isNaN(blockSizeValue) || blockSizeValue < 2) {
            toast.error('Block size must be at least 2')
            setIsRunning(false)
            setAttackProgress('')
            return
          }
          setAttackProgress(`Running BKZ-${blockSizeValue} with high precision (this may take 30-60s for large matrices)...`)
          lllResult = runPrecisionBKZ(basis, blockSizeValue, deltaValue, captureVisualization)
        } else {
          setAttackProgress(`Running LLL with high precision...`)
          lllResult = runPrecisionLLL(basis, deltaValue, captureVisualization)
        }
        
        if (lllResult.usedHighPrecision) {
          toast.success('High-precision BigInt arithmetic used', {
            description: 'Full secp256k1 values handled without precision loss'
          })
        }
      } else {
        if (algorithm === 'bkz') {
          const blockSizeValue = parseInt(blockSize)
          if (isNaN(blockSizeValue) || blockSizeValue < 2) {
            toast.error('Block size must be at least 2')
            setIsRunning(false)
            setAttackProgress('')
            return
          }
          setAttackProgress(`Running BKZ-${blockSizeValue}...`)
          lllResult = runBKZ(basis, blockSizeValue, deltaValue, captureVisualization)
        } else {
          setAttackProgress(`Running LLL...`)
          lllResult = runLLL(basis, deltaValue, captureVisualization)
        }
      }
    } catch (error) {
      console.error('Attack failed:', error)
      toast.error('Attack failed', {
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      })
      setIsRunning(false)
      setAttackProgress('')
      return
    }
    
    setAttackProgress('Attacking...')
    
    const endTime = performance.now()
    const executionTime = Math.round(endTime - startTime)

    const newResult = {
      reducedBasis: lllResult.reducedBasis,
      iterations: lllResult.iterations,
      executionTime,
      success: lllResult.success,
      solutionVector: lllResult.solutionVector,
      algorithm,
      blockSize: algorithm === 'bkz' ? lllResult.blockSize : undefined,
      usedHighPrecision: lllResult.usedHighPrecision,
      originalScale: lllResult.originalScale
    }

    setResult(newResult)

    if (lllResult.steps) {
      setVisualizationSteps(lllResult.steps)
      setCurrentVisualizationStep(0)
    }

    // Result Interpreter: Triggers immediately after BKZ converges
    let interpretedResult: InterpreterResult | null = null
    if (algorithm === 'bkz' && lllResult.success && currentAttackSignatures.length > 0) {
      setAttackProgress('Attacking...')
      
      interpretedResult = await interpretBKZResult(
        lllResult,
        currentAttackSignatures,
        {
          targetAddress: targetAddress || undefined,
          bias: 0n,
          scalingFactor: lllResult.originalScale || 1n,
          silentMode: true
        }
      )
      
      setInterpreterResult(interpretedResult)
      
      // Check if we should retry with higher block size
      const retryRec = getRetryRecommendation(interpretedResult)
      if (retryRec.shouldRetry && retryRec.recommendedBlockSize) {
        setAttackProgress(interpretedResult.message)
        toast.warning('Retry recommended', {
          description: `${retryRec.reason} (β=${retryRec.recommendedBlockSize})`
        })
      } else if (isKeyFound(interpretedResult)) {
        setAttackProgress('Attacking... Key Found!')
        toast.success('🎉 VICTORY! Private key found!', {
          description: `Key validated against target address. WIF available.`
        })
      } else {
        setAttackProgress(interpretedResult.message)
      }
    }

    // Legacy private key extraction (for non-BKZ or fallback)
    let privateKeyExtractionResult: PrivateKeyResult | null = null
    if (lllResult.success && currentAttackSignatures.length > 0 && !interpretedResult?.privateKey) {
      privateKeyExtractionResult = extractPrivateKeyFromAttack(
        lllResult.solutionVector,
        currentAttackSignatures,
        currentWeaknessType
      )
      
      if (privateKeyExtractionResult) {
        setPrivateKeyResult(privateKeyExtractionResult)
        
        if (privateKeyExtractionResult.isValid) {
          toast.success('Private key extracted and validated!', {
            description: 'Key successfully recovered from attack'
          })
        } else {
          toast.warning('Private key extracted but validation uncertain', {
            description: 'Extracted key may need manual verification'
          })
        }
      }
    } else if (interpretedResult?.privateKey) {
      // Convert interpreter result to PrivateKeyResult format for display
      privateKeyExtractionResult = {
        privateKey: interpretedResult.privateKey,
        privateKeyHex: interpretedResult.privateKeyHex || '',
        address: targetAddress || '',
        derivedAddress: interpretedResult.derivedAddress || '',
        isValid: interpretedResult.addressMatch || false,
        validationMethod: 'lattice-solution',
        confidence: interpretedResult.confidence,
        signatures: currentAttackSignatures
      }
      setPrivateKeyResult(privateKeyExtractionResult)
    }

    setIsRunning(false)
    setAttackProgress('')

    const newHistory: AttackHistory = {
      config: {
        id: Date.now().toString(),
        type: attackType,
        name: attackName,
        basis,
        delta: deltaValue,
        timestamp: Date.now(),
        algorithm,
        blockSize: algorithm === 'bkz' ? parseInt(blockSize) : undefined
      },
      result: {
        configId: Date.now().toString(),
        success: lllResult.success,
        reducedBasis: lllResult.reducedBasis,
        solutionVector: lllResult.solutionVector,
        iterations: lllResult.iterations,
        executionTime,
        timestamp: Date.now(),
        algorithm,
        blockSize: algorithm === 'bkz' ? lllResult.blockSize : undefined,
        privateKey: privateKeyExtractionResult?.privateKeyHex,
        privateKeyValid: privateKeyExtractionResult?.isValid,
        derivedAddress: privateKeyExtractionResult?.derivedAddress,
        keyExtractionConfidence: privateKeyExtractionResult?.confidence
      }
    }

    setAttackHistory((current) => [newHistory, ...(current || [])].slice(0, 50))

    if (lllResult.success) {
      toast.success(`Attack completed successfully! (${algorithm.toUpperCase()})`)
    } else {
      toast.error('Attack completed but may not have converged')
    }
  }

  const handleTemplateSelect = (template: AttackTemplate) => {
    setAttackType(template.type)
    setAttackName(template.name)
    setBasisInput(formatMatrixForDisplay(template.basis))
    setDelta(template.delta.toString())
    setResult(null)
    setVisualizationSteps([])
    setIsNormalized(false)
    toast.success(`Loaded template: ${template.name}`)
  }

  const handleRerun = (history: AttackHistory) => {
    setAttackType(history.config.type)
    setAttackName(history.config.name)
    setBasisInput(formatMatrixForDisplay(history.config.basis))
    setDelta(history.config.delta.toString())
    setAlgorithm(history.config.algorithm || 'lll')
    if (history.config.blockSize) {
      setBlockSize(history.config.blockSize.toString())
    }
    setResult(null)
    setVisualizationSteps([])
    toast.success('Configuration restored')
  }

  const handleClearHistory = () => {
    setAttackHistory([])
    toast.success('History cleared')
  }

  return (
    <div className="min-h-screen bg-background/50 p-4 md:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-8 md:mb-10">
          <div className="flex items-center gap-4 mb-3">
            <div className="p-3 bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl border border-primary/30 backdrop-blur-sm">
              <Calculator size={36} className="text-primary" weight="duotone" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent">
                Lattice Attack Suite
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Upload → Analyze → Discover Weaknesses → Generate Attacks
              </p>
            </div>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-7 max-w-4xl h-auto p-1.5 bg-card/50 backdrop-blur-sm border border-border/60">
            <TabsTrigger value="upload" className="flex items-center justify-center gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary py-2.5 px-3">
              <UploadSimple size={18} weight="duotone" />
              <span className="hidden sm:inline">Upload</span>
            </TabsTrigger>
            <TabsTrigger value="analyze" className="flex items-center justify-center gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary py-2.5 px-3">
              <Database size={18} weight="duotone" />
              <span className="hidden sm:inline">Analyze</span>
            </TabsTrigger>
            <TabsTrigger value="quick-attack" className="flex items-center justify-center gap-2 data-[state=active]:bg-accent/15 data-[state=active]:text-accent py-2.5 px-3">
              <Lightning size={18} weight="duotone" />
              <span className="hidden sm:inline">Quick</span>
            </TabsTrigger>
            <TabsTrigger value="sighash" className="flex items-center justify-center gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary py-2.5 px-3">
              <Function size={18} weight="duotone" />
              <span className="hidden sm:inline">Sighash</span>
            </TabsTrigger>
            <TabsTrigger value="attack" className="flex items-center justify-center gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary py-2.5 px-3">
              <Play size={18} weight="duotone" />
              <span className="hidden sm:inline">Manual</span>
            </TabsTrigger>
            <TabsTrigger value="visualization" disabled={visualizationSteps.length === 0} className="flex items-center justify-center gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary py-2.5 px-3">
              <ChartLine size={18} weight="duotone" />
              <span className="hidden sm:inline">Visual</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center justify-center gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary py-2.5 px-3">
              <ListBullets size={18} weight="duotone" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <Alert className="border-accent/50 bg-accent/10">
              <Lightbulb size={18} className="text-accent" weight="duotone" />
              <AlertDescription className="text-sm">
                <strong>⚠️ Browser Security Limitation:</strong> Direct blockchain API access is blocked by browser CORS policies. 
                <strong> Solution:</strong> Upload signature data files (JSON/CSV/TSV) directly for full functionality.
              </AlertDescription>
            </Alert>
            <BlockchairDataImport />
            <UrlListStreamToD1 />
            <BlockchairUpload onSignaturesExtracted={handleBlockchairSignatures} />
            <AddressLookup onAttackGenerated={handleAddressAttack} />
            <DataUpload onDataParsed={handleDataParsed} />
            <DatabaseConfigPanel 
              onStreamingEnabledChange={(enabled) => setDbStreamingEnabled(enabled)} 
            />
          </TabsContent>

          <TabsContent value="analyze" className="space-y-6">
            <SignatureRequirementInfo currentCount={uploadedSignatures.length} />
            <DimensionSelectorDisplay 
              result={dimensionSelectionResult} 
              totalSignatures={uploadedSignatures.length}
              isComputing={isAnalyzing}
            />
            <AnalysisDisplay 
              result={analysisResult || {
                totalAnalyzed: 0,
                weakSignatures: [],
                patterns: [],
                statistics: {
                  totalSignatures: 0,
                  uniqueAddresses: 0,
                  rValueDistribution: { min: 0n, max: 0n, mean: 0 },
                  sValueDistribution: { min: 0n, max: 0n, mean: 0 },
                  bitBias: { lsb: 0, msb: 0 },
                  addressFrequency: new Map()
                }
              }}
              onGenerateAttack={handleGenerateAttack}
              isAnalyzing={isAnalyzing}
            />
          </TabsContent>

          <TabsContent value="quick-attack" className="space-y-6">
            <Alert className="border-accent/50 bg-accent/10">
              <Lightning size={18} className="text-accent" weight="duotone" />
              <AlertDescription className="text-sm">
                <strong>⚡ Quick Attack Mode:</strong> Automatic strategy selection, intelligent retry logic, and one-click attack.
                Upload signatures first, then run the orchestrated attack.
              </AlertDescription>
            </Alert>
            <UnifiedAttackRunner 
              signatures={uploadedSignatures}
              targetAddress={targetAddress}
              onKeyFound={(keyHex, keyWIF) => {
                setPrivateKeyResult({
                  privateKey: BigInt(keyHex),
                  privateKeyHex: keyHex,
                  address: targetAddress,
                  derivedAddress: '',
                  isValid: true,
                  validationMethod: 'orchestrator',
                  confidence: 1.0,
                  signatures: uploadedSignatures
                })
                toast.success('🎉 Private Key Recovered!', {
                  description: 'Check the results for WIF format'
                })
              }}
            />
          </TabsContent>

          <TabsContent value="sighash" className="space-y-6">
            <SighashCalculator />
          </TabsContent>

          <TabsContent value="attack" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <span className="w-1 h-6 bg-primary rounded-full"></span>
                      Attack Configuration
                    </h2>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTemplateDialogOpen(true)}
                      className="border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                    >
                      <Lightbulb size={16} weight="duotone" />
                      Templates
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="attack-type" className="text-sm font-medium mb-2 block">
                        Attack Type
                      </Label>
                      <Select value={attackType} onValueChange={(v) => setAttackType(v as AttackType)}>
                        <SelectTrigger id="attack-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Custom</SelectItem>
                          <SelectItem value="rsa">RSA Attack</SelectItem>
                          <SelectItem value="subset-sum">Subset Sum</SelectItem>
                          <SelectItem value="knapsack">Knapsack</SelectItem>
                          <SelectItem value="cvp">Closest Vector Problem</SelectItem>
                          <SelectItem value="hnp">Hidden Number Problem</SelectItem>
                          <SelectItem value="ntru">NTRU</SelectItem>
                          <SelectItem value="dsa">DSA/ECDSA</SelectItem>
                          <SelectItem value="signature-scan">Signature Scan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="algorithm" className="text-sm font-medium mb-2 block">
                        Algorithm
                      </Label>
                      <Select value={algorithm} onValueChange={(v) => setAlgorithm(v as AlgorithmType)}>
                        <SelectTrigger id="algorithm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lll">LLL (Standard)</SelectItem>
                          <SelectItem value="bkz">BKZ (Block Korkine-Zolotarev)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        BKZ provides stronger reduction but takes longer
                      </p>
                    </div>

                    {algorithm === 'bkz' && (
                      <div>
                        <Label htmlFor="block-size" className="text-sm font-medium mb-2 block">
                          Block Size
                        </Label>
                        <Input
                          id="block-size"
                          type="number"
                          min="2"
                          max="40"
                          value={blockSize}
                          onChange={(e) => setBlockSize(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Larger blocks = better reduction but slower (typical: 10-30 for large matrices)
                        </p>
                      </div>
                    )}

                    <div>
                      <Label htmlFor="attack-name" className="text-sm font-medium mb-2 block">
                        Attack Name
                      </Label>
                      <Input
                        id="attack-name"
                        value={attackName}
                        onChange={(e) => setAttackName(e.target.value)}
                        placeholder="My Custom Attack"
                      />
                    </div>

                    <div>
                      <Label htmlFor="target-address" className="text-sm font-medium mb-2 block">
                        Target Address (for validation)
                      </Label>
                      <Input
                        id="target-address"
                        value={targetAddress}
                        onChange={(e) => setTargetAddress(e.target.value)}
                        placeholder="e.g., 32Bf... or 1A1zP..."
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Optional: Bitcoin/Ethereum address to validate the recovered key against
                      </p>
                    </div>

                    <MatrixInput
                      value={basisInput}
                      onChange={setBasisInput}
                      label="Lattice Basis Matrix"
                      placeholder="Enter basis vectors (one per line):"
                    />
                    
                    {(() => {
                      const basis = parseBasisFromString(basisInput)
                      if (basis && basis.length > 0) {
                        const rows = basis.length
                        const cols = basis[0]?.length || 0
                        const dimension = rows
                        
                        let statusColor = "border-destructive/50 bg-destructive/10 text-destructive"
                        let statusIcon = "❌"
                        let statusText = "Insufficient dimension"
                        
                        if (dimension >= 40) {
                          statusColor = "border-success/50 bg-success/10 text-success"
                          statusIcon = "✅"
                          statusText = "Excellent dimension for key extraction"
                        } else if (dimension >= 20) {
                          statusColor = "border-warning/50 bg-warning/10 text-warning"
                          statusIcon = "⚠️"
                          statusText = "Marginal dimension - may find noise"
                        } else if (dimension >= 10) {
                          statusColor = "border-destructive/50 bg-destructive/10 text-destructive"
                          statusIcon = "⚠️"
                          statusText = "Low dimension - likely to fail"
                        }
                        
                        return (
                          <>
                            <Alert className={statusColor}>
                              <AlertDescription className="text-xs">
                                <div className="flex items-center justify-between mb-1">
                                  <span>
                                    {statusIcon} <strong>Matrix: {rows}×{cols}</strong>
                                  </span>
                                  <span className="font-semibold">
                                    {dimension < 40 ? `Need ${40 - dimension} more sigs` : 'Ready for attack'}
                                  </span>
                                </div>
                                <div className="text-[10px] opacity-80">
                                  {statusText}
                                </div>
                              </AlertDescription>
                            </Alert>
                            
                            {dimension >= 30 && algorithm === 'bkz' && (
                              <Alert className="border-warning/50 bg-warning/10">
                                <AlertDescription className="text-xs">
                                  ⏱️ <strong>Large Matrix Warning:</strong> BKZ on {dimension}×{dimension} matrix may take 30-90 seconds. The browser may appear frozen but is still computing.
                                </AlertDescription>
                              </Alert>
                            )}
                          </>
                        )
                      }
                      return null
                    })()}
                    
                    {isNormalized && (
                      <Alert className="border-accent/50 bg-accent/10">
                        <AlertDescription className="text-xs">
                          ℹ️ Matrix normalized for numerical stability. Scaled down from secp256k1 values to prevent overflow in JavaScript.
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    <PrecisionWarning values={parseBasisFromString(basisInput)?.flat() || []} />

                    <div>
                      <Label htmlFor="delta" className="text-sm font-medium mb-2 block">
                        Delta Parameter (δ)
                      </Label>
                      <Input
                        id="delta"
                        type="number"
                        step="0.01"
                        min="0.25"
                        max="0.99"
                        value={delta}
                        onChange={(e) => setDelta(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Typical range: 0.75 (fast) to 0.99 (better reduction)
                      </p>
                    </div>

                    <Separator />
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="use-precision"
                        checked={usePrecisionMode}
                        onCheckedChange={(checked) => setUsePrecisionMode(checked as boolean)}
                      />
                      <Label htmlFor="use-precision" className="text-sm font-medium cursor-pointer">
                        Use high-precision arithmetic (BigInt)
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Automatically handles full secp256k1 values without precision loss. Recommended for cryptographic attacks.
                    </p>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="capture-visualization"
                        checked={captureVisualization}
                        onCheckedChange={(checked) => setCaptureVisualization(checked as boolean)}
                      />
                      <Label htmlFor="capture-visualization" className="text-sm font-medium cursor-pointer">
                        Capture visualization steps
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Enable to see animated vector transformations (may slow down large attacks)
                    </p>

                    <Separator />

                    <Button
                      onClick={handleRunAttack}
                      disabled={isRunning}
                      className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg shadow-primary/20"
                      size="lg"
                    >
                      {isRunning ? (
                        <>
                          <div className="animate-spin mr-2 h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full" />
                          Running Attack...
                        </>
                      ) : (
                        <>
                          <Play size={20} weight="fill" />
                          Run Attack
                        </>
                      )}
                    </Button>
                    
                    {attackProgress && (
                      <Alert className="border-primary/50 bg-primary/10">
                        <AlertDescription className="text-xs">
                          <div className="flex items-center gap-2">
                            <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
                            <span>{attackProgress}</span>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                {/* Dimension Selector Display - shows intelligent selection info */}
                {dimensionSelectionResult && (
                  <DimensionSelectorDisplay 
                    result={dimensionSelectionResult} 
                    totalSignatures={currentAttackSignatures.length}
                    isComputing={false}
                  />
                )}
                
                {(() => {
                  const basis = parseBasisFromString(basisInput)
                  if (basis && basis.length > 0) {
                    const dimension = basis.length
                    
                    return (
                      <>
                        <DimensionGuidance
                          currentDimension={dimension}
                          signatureCount={currentAttackSignatures.length}
                          attackType={attackType}
                          isNormalized={isNormalized}
                        />
                        
                        {dimension >= 30 && currentAttackSignatures.length >= 30 && (
                          <LargeDimensionInfo
                            dimension={dimension}
                            signatureCount={currentAttackSignatures.length}
                            estimatedTime={dimension >= 60 ? 'Very High (30-120s)' : dimension >= 45 ? 'High (10-60s)' : 'Medium (5-20s)'}
                          />
                        )}
                      </>
                    )
                  }
                  return null
                })()}
                
                {result ? (
                  <>
                    {/* Primary Attack Status Message - Always visible */}
                    <Card className={`p-6 border-2 shadow-lg ${
                      interpreterResult?.status === 'KEY_FOUND' 
                        ? 'bg-gradient-to-br from-success/20 to-accent/20 border-success/60' 
                        : interpreterResult?.status === 'RETRY_HIGHER_BLOCK_SIZE'
                        ? 'bg-gradient-to-br from-warning/20 to-orange-500/20 border-warning/60'
                        : 'bg-card/80 border-border/60'
                    }`}>
                      <div className="text-center py-4">
                        <h2 className={`text-2xl font-bold mb-2 ${
                          interpreterResult?.status === 'KEY_FOUND' ? 'text-success' : ''
                        }`}>
                          {interpreterResult?.message || (result.success ? 'Attacking... Complete' : 'Attacking... Not Found')}
                        </h2>
                        {interpreterResult?.status === 'KEY_FOUND' && interpreterResult.privateKeyWIF && (
                          <div className="mt-4 p-4 bg-card/80 rounded-lg border border-success/30">
                            <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">WIF (Wallet Import Format)</div>
                            <div className="font-mono text-sm break-all text-success bg-secondary/30 p-3 rounded">
                              {interpreterResult.privateKeyWIF}
                            </div>
                          </div>
                        )}
                        {interpreterResult?.status === 'RETRY_HIGHER_BLOCK_SIZE' && interpreterResult.recommendedBlockSize && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="mt-4 border-warning/50 hover:bg-warning/10"
                            onClick={() => {
                              const recBlockSize = interpreterResult.recommendedBlockSize
                              if (recBlockSize) {
                                setBlockSize(recBlockSize.toString())
                              }
                            }}
                          >
                            Retry with β={interpreterResult.recommendedBlockSize}
                          </Button>
                        )}
                      </div>
                    </Card>

                    {result.usedHighPrecision !== undefined && (
                      <PrecisionIndicator 
                        usedHighPrecision={result.usedHighPrecision}
                        originalScale={result.originalScale}
                        matrixSize={{ 
                          rows: result.reducedBasis.length, 
                          cols: result.reducedBasis[0]?.length || 0 
                        }}
                      />
                    )}

                    {privateKeyResult && (
                      <PrivateKeyDisplay result={privateKeyResult} />
                    )}

                    {/* Show/Hide Matrix Details Toggle */}
                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowMatrixDetails(!showMatrixDetails)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {showMatrixDetails ? '▼ Hide Matrix Details' : '▶ Show Matrix Details'}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {result.iterations} iterations • {result.executionTime}ms
                      </span>
                    </div>

                    {/* Matrix Details - Hidden by default (Silence mode) */}
                    {showMatrixDetails && (
                      <>
                        <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
                          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                            <span className="w-1 h-6 bg-accent rounded-full"></span>
                            Attack Results
                          </h2>
                          
                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
                              <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Algorithm</div>
                              <div className="text-xl font-bold text-primary">{result.algorithm?.toUpperCase() || 'LLL'}</div>
                            </div>
                            {result.blockSize && (
                              <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
                                <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Block Size</div>
                                <div className="text-xl font-bold text-accent">{result.blockSize}</div>
                              </div>
                            )}
                            <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
                              <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Iterations</div>
                              <div className="text-xl font-bold text-foreground">{result.iterations}</div>
                            </div>
                            <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
                              <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Time</div>
                              <div className="text-xl font-bold text-foreground">{result.executionTime}ms</div>
                            </div>
                          </div>

                          <Alert className={result.success ? 'border-success/50 bg-success/10' : 'border-warning/50 bg-warning/10'}>
                            <AlertDescription className="text-sm font-medium">
                              {result.success
                                ? '✓ Algorithm converged successfully. Reduced basis found.'
                                : '⚠ Algorithm completed but may not have fully converged.'}
                            </AlertDescription>
                          </Alert>
                        </Card>
                        
                        {result.solutionVector && result.blockSize && (
                          <SaturationWarning
                            dimension={result.reducedBasis.length}
                            blockSize={result.blockSize}
                            foundZeroInFirstPosition={result.solutionVector[0] === 0}
                          />
                        )}

                        <VectorDisplay
                          matrix={result.reducedBasis}
                          title="Reduced Basis"
                          highlightFirst={true}
                          success={result.success}
                        />

                        {result.solutionVector && (
                          <VectorDisplay
                            matrix={[result.solutionVector]}
                            title="Shortest Vector (Solution)"
                          />
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
                    <div className="text-center py-16">
                      <div className="inline-flex p-6 rounded-2xl bg-muted/30 mb-6">
                        <Calculator size={56} className="text-muted-foreground/40" weight="duotone" />
                      </div>
                      <h3 className="text-lg font-bold mb-2">No Results Yet</h3>
                      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                        Configure your attack parameters and click "Run Attack" to see results
                      </p>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="visualization" className="space-y-6">
            {visualizationSteps.length > 0 ? (
              <>
                <VectorVisualization 
                  steps={visualizationSteps}
                  dimension={visualizationSteps[0]?.basis[0]?.length || 0}
                  onStepChange={setCurrentVisualizationStep}
                />
                
                <div className="grid lg:grid-cols-2 gap-6">
                  <MatrixHeatmap 
                    steps={visualizationSteps}
                    currentStep={currentVisualizationStep}
                  />
                  <OrthogonalityChart steps={visualizationSteps} />
                </div>
              </>
            ) : (
              <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
                <div className="text-center py-16">
                  <div className="inline-flex p-6 rounded-2xl bg-muted/30 mb-6">
                    <ChartLine size={56} className="text-muted-foreground/40" weight="duotone" />
                  </div>
                  <h3 className="text-lg font-bold mb-3">No Visualization Data</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                    Enable "Capture visualization steps" in the Attack tab and run an attack to see animated vector transformations and reduction progress
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setActiveTab('attack')}
                    className="border-primary/30 hover:bg-primary/10"
                  >
                    Go to Attack Tab
                  </Button>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <span className="w-1 h-6 bg-primary rounded-full"></span>
                  Attack History
                </h2>
                {(attackHistory?.length || 0) > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearHistory}
                    className="border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50 text-destructive"
                  >
                    Clear History
                  </Button>
                )}
              </div>

              {(attackHistory?.length || 0) === 0 ? (
                <div className="text-center py-16">
                  <div className="inline-flex p-6 rounded-2xl bg-muted/30 mb-6">
                    <ListBullets size={56} className="text-muted-foreground/40" weight="duotone" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">No Attack History</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    Run your first attack to start building history
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[650px] pr-4">
                  <div className="space-y-4">
                    {(attackHistory || []).map((history, idx) => (
                      <AttackCard
                        key={history.config.id + idx}
                        history={history}
                        onRerun={handleRerun}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <TemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onSelectTemplate={handleTemplateSelect}
      />
    </div>
  )
}

export default App
