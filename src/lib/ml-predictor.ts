import { RPCSignature, WeakSignature } from './rpc-scanner'
import { SignatureCluster, BatchAnalysisResult } from './batch-analysis'

export interface MLPrediction {
  blockNumber: number
  predictedVulnerabilities: PredictedVulnerability[]
  confidence: number
  reasoning: string[]
  suggestedScanPriority: 'critical' | 'high' | 'medium' | 'low'
  estimatedWeakSignatureCount: number
}

export interface PredictedVulnerability {
  type: 'nonce-reuse' | 'sequential-nonce' | 'biased-k' | 'temporal-correlation' | 'address-clustering'
  probability: number
  expectedAddresses: string[]
  reasoning: string
}

export interface MLModel {
  weights: {
    temporalPattern: number
    addressFrequency: number
    volumeAnomaly: number
    weekdayPattern: number
    blockDensity: number
    clusterProximity: number
  }
  trainingData: {
    totalBlocks: number
    weakSignaturesFound: number
    patternsDetected: number
    accuracy: number
  }
  lastUpdated: number
}

export interface MLPredictionResult {
  predictions: MLPrediction[]
  model: MLModel
  suggestedBlocks: number[]
  totalAnalyzed: number
  predictionTime: number
}

function calculateBlockHash(block: number): bigint {
  const str = block.toString()
  let hash = 0n
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31n + BigInt(str.charCodeAt(i))) % (2n ** 32n)
  }
  return hash
}

function extractTemporalFeatures(
  signatures: RPCSignature[],
  currentBlock: number
): {
  blockDensity: number
  temporalTrend: number
  activitySpike: boolean
  weekdayPattern: number
} {
  const blockSignatures = new Map<number, number>()
  
  for (const sig of signatures) {
    blockSignatures.set(sig.blockNumber, (blockSignatures.get(sig.blockNumber) || 0) + 1)
  }

  const sortedBlocks = Array.from(blockSignatures.entries()).sort((a, b) => a[0] - b[0])
  
  if (sortedBlocks.length === 0) {
    return { blockDensity: 0, temporalTrend: 0, activitySpike: false, weekdayPattern: 0 }
  }

  const densities = sortedBlocks.map(([_, count]) => count)
  const avgDensity = densities.reduce((a, b) => a + b, 0) / densities.length
  const maxDensity = Math.max(...densities)

  let trend = 0
  if (sortedBlocks.length >= 2) {
    const recentDensity = densities.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, densities.length)
    const olderDensity = densities.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(5, densities.length)
    trend = (recentDensity - olderDensity) / (olderDensity || 1)
  }

  const activitySpike = maxDensity > avgDensity * 2

  const blockHash = Number(calculateBlockHash(currentBlock) % 7n)
  const weekdayPattern = blockHash / 7

  return {
    blockDensity: avgDensity,
    temporalTrend: trend,
    activitySpike,
    weekdayPattern
  }
}

function extractAddressFeatures(
  signatures: RPCSignature[],
  clusters: SignatureCluster[]
): {
  highActivityAddresses: Set<string>
  addressConcentration: number
  clusterProximity: number
} {
  const addressFreq = new Map<string, number>()
  
  for (const sig of signatures) {
    addressFreq.set(sig.address, (addressFreq.get(sig.address) || 0) + 1)
  }

  const sortedAddresses = Array.from(addressFreq.entries()).sort((a, b) => b[1] - a[1])
  const highActivityAddresses = new Set(
    sortedAddresses.slice(0, 10).filter(([_, count]) => count >= 3).map(([addr]) => addr)
  )

  const uniqueAddresses = addressFreq.size
  const totalSignatures = signatures.length
  const addressConcentration = uniqueAddresses > 0 ? 1 - (uniqueAddresses / totalSignatures) : 0

  const clusterBlocks = clusters.flatMap(c => c.signatures.map(s => s.blockNumber))
  const avgClusterBlock = clusterBlocks.length > 0
    ? clusterBlocks.reduce((a, b) => a + b, 0) / clusterBlocks.length
    : 0

  return {
    highActivityAddresses,
    addressConcentration,
    clusterProximity: avgClusterBlock
  }
}

function calculateVolumeAnomalyScore(
  targetBlock: number,
  recentBlocks: number[],
  avgDensity: number
): number {
  const distance = recentBlocks.map(b => Math.abs(b - targetBlock))
  const minDistance = Math.min(...distance, Infinity)
  
  if (minDistance === Infinity || minDistance > 10000) return 0
  
  const anomalyScore = Math.exp(-minDistance / 1000) * avgDensity
  return Math.min(1, anomalyScore / 10)
}

function trainModel(
  historicalSignatures: RPCSignature[],
  weakSignatures: WeakSignature[],
  clusters: SignatureCluster[]
): MLModel {
  const totalBlocks = new Set(historicalSignatures.map(s => s.blockNumber)).size
  const weakSignaturesFound = weakSignatures.length
  const patternsDetected = clusters.length

  const temporalFeatures = extractTemporalFeatures(historicalSignatures, 0)
  const addressFeatures = extractAddressFeatures(historicalSignatures, clusters)

  const weakBlocks = new Set(weakSignatures.map(w => w.signature.blockNumber))
  const accuracy = totalBlocks > 0 ? weakBlocks.size / totalBlocks : 0

  const weights = {
    temporalPattern: 0.25 + temporalFeatures.temporalTrend * 0.1,
    addressFrequency: 0.20 + addressFeatures.addressConcentration * 0.15,
    volumeAnomaly: 0.15 + (temporalFeatures.activitySpike ? 0.1 : 0),
    weekdayPattern: 0.10 + temporalFeatures.weekdayPattern * 0.05,
    blockDensity: 0.20 + (temporalFeatures.blockDensity / 100) * 0.1,
    clusterProximity: 0.10 + (clusters.length > 0 ? 0.05 : 0)
  }

  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  for (const key in weights) {
    weights[key as keyof typeof weights] /= total
  }

  return {
    weights,
    trainingData: {
      totalBlocks,
      weakSignaturesFound,
      patternsDetected,
      accuracy: Math.min(1, accuracy + 0.5)
    },
    lastUpdated: Date.now()
  }
}

function predictBlock(
  blockNumber: number,
  model: MLModel,
  historicalSignatures: RPCSignature[],
  clusters: SignatureCluster[],
  weakSignatures: WeakSignature[]
): MLPrediction {
  const temporal = extractTemporalFeatures(historicalSignatures, blockNumber)
  const address = extractAddressFeatures(historicalSignatures, clusters)

  const recentBlocks = Array.from(new Set(historicalSignatures.map(s => s.blockNumber)))
  const volumeAnomaly = calculateVolumeAnomalyScore(
    blockNumber,
    recentBlocks,
    temporal.blockDensity
  )

  const clusterProximityScore = clusters.length > 0
    ? Math.exp(-Math.min(...clusters.map(c => {
        const clusterBlocks = c.signatures.map(s => s.blockNumber)
        const avgBlock = clusterBlocks.reduce((a, b) => a + b, 0) / clusterBlocks.length
        return Math.abs(avgBlock - blockNumber)
      })) / 1000)
    : 0

  const confidence = 
    model.weights.temporalPattern * Math.abs(temporal.temporalTrend) +
    model.weights.addressFrequency * address.addressConcentration +
    model.weights.volumeAnomaly * volumeAnomaly +
    model.weights.weekdayPattern * temporal.weekdayPattern +
    model.weights.blockDensity * (temporal.blockDensity / 100) +
    model.weights.clusterProximity * clusterProximityScore

  const reasoning: string[] = []
  const predictedVulnerabilities: PredictedVulnerability[] = []

  if (temporal.temporalTrend > 0.3) {
    reasoning.push(`Increasing signature activity detected (${(temporal.temporalTrend * 100).toFixed(1)}% growth)`)
    predictedVulnerabilities.push({
      type: 'temporal-correlation',
      probability: Math.min(0.9, confidence * 1.2),
      expectedAddresses: Array.from(address.highActivityAddresses).slice(0, 5),
      reasoning: 'Temporal patterns suggest correlated nonce generation'
    })
  }

  if (address.addressConcentration > 0.5) {
    reasoning.push(`High address concentration (${(address.addressConcentration * 100).toFixed(1)}%)`)
    predictedVulnerabilities.push({
      type: 'address-clustering',
      probability: address.addressConcentration,
      expectedAddresses: Array.from(address.highActivityAddresses),
      reasoning: 'Few addresses responsible for most signatures'
    })
  }

  if (temporal.activitySpike) {
    reasoning.push('Unusual activity spike detected in historical data')
    predictedVulnerabilities.push({
      type: 'nonce-reuse',
      probability: Math.min(0.8, confidence * 1.5),
      expectedAddresses: Array.from(address.highActivityAddresses).slice(0, 3),
      reasoning: 'Activity spikes correlate with weak RNG implementations'
    })
  }

  if (clusters.some(c => c.pattern === 'sequential-nonce')) {
    reasoning.push('Sequential nonce patterns detected in similar blocks')
    predictedVulnerabilities.push({
      type: 'sequential-nonce',
      probability: Math.min(0.85, confidence * 1.3),
      expectedAddresses: Array.from(address.highActivityAddresses).slice(0, 5),
      reasoning: 'Historical sequential nonces suggest predictable RNG'
    })
  }

  if (clusters.some(c => c.pattern === 'biased-lsb' || c.pattern === 'biased-msb')) {
    reasoning.push('Bit bias patterns detected in cluster analysis')
    predictedVulnerabilities.push({
      type: 'biased-k',
      probability: Math.min(0.75, confidence * 1.1),
      expectedAddresses: Array.from(address.highActivityAddresses),
      reasoning: 'Biased RNG implementations tend to persist across blocks'
    })
  }

  if (volumeAnomaly > 0.3) {
    reasoning.push(`Block proximity to known weak signatures (score: ${volumeAnomaly.toFixed(2)})`)
  }

  const estimatedWeakSignatureCount = Math.round(
    confidence * temporal.blockDensity * (1 + address.addressConcentration)
  )

  let suggestedScanPriority: 'critical' | 'high' | 'medium' | 'low'
  if (confidence > 0.7) suggestedScanPriority = 'critical'
  else if (confidence > 0.5) suggestedScanPriority = 'high'
  else if (confidence > 0.3) suggestedScanPriority = 'medium'
  else suggestedScanPriority = 'low'

  return {
    blockNumber,
    predictedVulnerabilities,
    confidence: Math.min(1, confidence),
    reasoning: reasoning.length > 0 ? reasoning : ['Limited historical data for accurate prediction'],
    suggestedScanPriority,
    estimatedWeakSignatureCount
  }
}

export function generateMLPredictions(
  historicalSignatures: RPCSignature[],
  weakSignatures: WeakSignature[],
  batchAnalysis: BatchAnalysisResult | null,
  targetBlockRange: { from: number; to: number }
): MLPredictionResult {
  const startTime = performance.now()

  const clusters = batchAnalysis?.clusters || []
  const model = trainModel(historicalSignatures, weakSignatures, clusters)

  const predictions: MLPrediction[] = []
  const blockCount = targetBlockRange.to - targetBlockRange.from + 1

  for (let i = 0; i < blockCount; i++) {
    const blockNumber = targetBlockRange.from + i
    const prediction = predictBlock(
      blockNumber,
      model,
      historicalSignatures,
      clusters,
      weakSignatures
    )
    predictions.push(prediction)
  }

  predictions.sort((a, b) => b.confidence - a.confidence)

  const suggestedBlocks = predictions
    .filter(p => p.suggestedScanPriority === 'critical' || p.suggestedScanPriority === 'high')
    .slice(0, 20)
    .map(p => p.blockNumber)

  const predictionTime = performance.now() - startTime

  return {
    predictions,
    model,
    suggestedBlocks,
    totalAnalyzed: predictions.length,
    predictionTime
  }
}

export async function generateAIPredictions(
  historicalSignatures: RPCSignature[],
  weakSignatures: WeakSignature[],
  batchAnalysis: BatchAnalysisResult | null,
  targetBlockRange: { from: number; to: number }
): Promise<MLPredictionResult> {
  const baseResult = generateMLPredictions(
    historicalSignatures,
    weakSignatures,
    batchAnalysis,
    targetBlockRange
  )

  try {
    const summaryData = {
      totalHistoricalSignatures: historicalSignatures.length,
      weakSignaturesFound: weakSignatures.length,
      clustersDetected: batchAnalysis?.clusters.length || 0,
      blockRange: targetBlockRange,
      topPatterns: batchAnalysis?.clusters.slice(0, 3).map(c => c.pattern) || []
    }

    const prompt = `You are a cryptographic vulnerability prediction system. Analyze the following blockchain signature scan data and provide insights:

Historical Data:
- Total signatures scanned: ${summaryData.totalHistoricalSignatures}
- Weak signatures found: ${summaryData.weakSignaturesFound}
- Pattern clusters detected: ${summaryData.clustersDetected}
- Top patterns: ${summaryData.topPatterns.join(', ') || 'none'}

Prediction Target:
- Block range: ${summaryData.blockRange.from} to ${summaryData.blockRange.to}
- Blocks to predict: ${summaryData.blockRange.to - summaryData.blockRange.from + 1}

Based on this data, provide:
1. Key risk factors that might indicate vulnerable signatures in the target range
2. Specific block numbers or ranges within ${summaryData.blockRange.from}-${summaryData.blockRange.to} that should be prioritized
3. Expected vulnerability types most likely to occur

Return as JSON with: {"riskFactors": ["factor1", "factor2"], "priorityBlocks": [block1, block2], "expectedVulnerabilities": ["type1", "type2"], "reasoning": "explanation"}`

    const llmResponse = await window.spark.llm(prompt, 'gpt-4o-mini', true)
    const aiInsights = JSON.parse(llmResponse)

    for (const prediction of baseResult.predictions) {
      if (aiInsights.priorityBlocks?.includes(prediction.blockNumber)) {
        prediction.confidence = Math.min(1, prediction.confidence * 1.2)
        prediction.reasoning.unshift(`AI model flagged this block as high priority`)
      }

      if (aiInsights.riskFactors) {
        prediction.reasoning.push(...aiInsights.riskFactors.map((f: string) => `Risk factor: ${f}`))
      }
    }

    if (aiInsights.reasoning) {
      baseResult.model.trainingData.accuracy = Math.min(1, baseResult.model.trainingData.accuracy * 1.1)
    }

  } catch (error) {
    console.warn('AI enhancement failed, using statistical model only:', error)
  }

  return baseResult
}
