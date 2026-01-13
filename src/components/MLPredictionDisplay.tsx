import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Brain, TrendUp, Target, Crosshair, Sparkle, Flame, ListChecks } from '@phosphor-icons/react'
import { MLPrediction, MLPredictionResult, PredictedVulnerability, ScanRecommendation } from '@/lib/ml-predictor'
import { RiskHeatmap } from '@/components/RiskHeatmap'
import { ScanRecommendations } from '@/components/ScanRecommendations'

interface MLPredictionDisplayProps {
  predictionResult: MLPredictionResult
  onScanBlock: (blockNumber: number) => void
  onScanRange: (from: number, to: number) => void
  onAutoScanAll?: (recommendations: ScanRecommendation[]) => void
}

export function MLPredictionDisplay({ 
  predictionResult, 
  onScanBlock, 
  onScanRange,
  onAutoScanAll 
}: MLPredictionDisplayProps) {
  const [activeTab, setActiveTab] = useState('overview')

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-destructive/10 text-destructive border-destructive/20'
      case 'high':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
      case 'low':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const getVulnerabilityColor = (type: string) => {
    switch (type) {
      case 'nonce-reuse':
        return 'text-destructive'
      case 'sequential-nonce':
        return 'text-orange-400'
      case 'biased-k':
        return 'text-yellow-400'
      case 'temporal-correlation':
        return 'text-blue-400'
      case 'address-clustering':
        return 'text-purple-400'
      default:
        return 'text-muted-foreground'
    }
  }

  const topPredictions = predictionResult.predictions
    .filter(p => p.suggestedScanPriority === 'critical' || p.suggestedScanPriority === 'high')
    .slice(0, 10)

  const criticalCount = predictionResult.predictions.filter(p => p.suggestedScanPriority === 'critical').length
  const highCount = predictionResult.predictions.filter(p => p.suggestedScanPriority === 'high').length
  const mediumCount = predictionResult.predictions.filter(p => p.suggestedScanPriority === 'medium').length

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">
          <Brain size={16} className="mr-2" />
          Overview
        </TabsTrigger>
        <TabsTrigger value="recommendations">
          <ListChecks size={16} className="mr-2" />
          Recommendations
        </TabsTrigger>
        <TabsTrigger value="heatmap">
          <Flame size={16} className="mr-2" />
          Risk Heatmap
        </TabsTrigger>
        <TabsTrigger value="predictions">
          <Target size={16} className="mr-2" />
          All Predictions
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center gap-3 mb-4">
            <Brain size={24} className="text-accent" weight="fill" />
            <div>
              <h2 className="text-lg font-semibold">ML Pattern Predictions</h2>
              <p className="text-xs text-muted-foreground">
                AI-powered vulnerability forecasting for unscanned blocks
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-secondary/50 p-3 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Model Accuracy</div>
              <div className="text-xl font-bold">
                {(predictionResult.model.trainingData.accuracy * 100).toFixed(1)}%
              </div>
            </div>
            <div className="bg-secondary/50 p-3 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Training Data</div>
              <div className="text-xl font-bold">
                {predictionResult.model.trainingData.totalBlocks} blocks
              </div>
            </div>
            <div className="bg-secondary/50 p-3 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Patterns Found</div>
              <div className="text-xl font-bold">
                {predictionResult.model.trainingData.patternsDetected}
              </div>
            </div>
            <div className="bg-secondary/50 p-3 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Prediction Time</div>
              <div className="text-xl font-bold">
                {predictionResult.predictionTime.toFixed(0)}ms
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="space-y-2 mb-4">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Priority Distribution</span>
              <span className="font-mono">
                {criticalCount}C / {highCount}H / {mediumCount}M
              </span>
            </div>
            <div className="flex gap-1 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-destructive" 
                style={{ width: `${(criticalCount / predictionResult.predictions.length) * 100}%` }}
              />
              <div 
                className="bg-orange-500" 
                style={{ width: `${(highCount / predictionResult.predictions.length) * 100}%` }}
              />
              <div 
                className="bg-yellow-500" 
                style={{ width: `${(mediumCount / predictionResult.predictions.length) * 100}%` }}
              />
              <div 
                className="bg-blue-500" 
                style={{ 
                  width: `${((predictionResult.predictions.length - criticalCount - highCount - mediumCount) / predictionResult.predictions.length) * 100}%` 
                }}
              />
            </div>
          </div>

          {predictionResult.scanRecommendations.length > 0 && (
            <Alert className="bg-accent/10 border-accent/20">
              <Sparkle size={16} className="text-accent" weight="fill" />
              <AlertDescription className="text-xs">
                <strong>Smart Scan Available:</strong> ML model has identified {predictionResult.scanRecommendations.length} optimized scan{predictionResult.scanRecommendations.length !== 1 ? 's' : ''} for maximum vulnerability detection. 
                View the Recommendations tab for details.
              </AlertDescription>
            </Alert>
          )}
        </Card>

        <Card className="p-6 bg-card border-border">
          <h3 className="text-base font-semibold mb-4">Model Feature Weights</h3>
          <div className="space-y-3">
            {Object.entries(predictionResult.model.weights).map(([feature, weight]) => (
              <div key={feature}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground capitalize">
                    {feature.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <span className="font-mono">{(weight * 100).toFixed(1)}%</span>
                </div>
                <Progress value={weight * 100} className="h-1.5" />
              </div>
            ))}
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="recommendations">
        <ScanRecommendations
          recommendations={predictionResult.scanRecommendations}
          onScanRecommendation={onScanRange}
          onAutoScanAll={onAutoScanAll || (() => {})}
        />
      </TabsContent>

      <TabsContent value="heatmap">
        <RiskHeatmap
          heatmap={predictionResult.riskHeatmap}
          onSelectBlock={onScanBlock}
        />
      </TabsContent>

      <TabsContent value="predictions">
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">High-Priority Predictions</h3>
            <Badge variant="outline" className="text-xs">
              Top {topPredictions.length} blocks
            </Badge>
          </div>

          {topPredictions.length === 0 ? (
            <div className="text-center py-8">
              <TrendUp size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold mb-2">No High-Priority Predictions</h3>
              <p className="text-xs text-muted-foreground">
                Model confidence is low for the target range. Try scanning a different area or gathering more training data.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-3">
                {topPredictions.map((prediction) => (
                  <PredictionCard
                    key={prediction.blockNumber}
                    prediction={prediction}
                    onScanBlock={onScanBlock}
                    getPriorityColor={getPriorityColor}
                    getVulnerabilityColor={getVulnerabilityColor}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </Card>
      </TabsContent>
    </Tabs>
  )
}

interface PredictionCardProps {
  prediction: MLPrediction
  onScanBlock: (blockNumber: number) => void
  getPriorityColor: (priority: string) => string
  getVulnerabilityColor: (type: string) => string
}

function PredictionCard({ 
  prediction, 
  onScanBlock, 
  getPriorityColor,
  getVulnerabilityColor 
}: PredictionCardProps) {
  return (
    <div className="bg-secondary/30 p-4 rounded-lg space-y-3 border border-border/50">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-semibold">
              Block {prediction.blockNumber.toLocaleString()}
            </span>
            <Badge className={getPriorityColor(prediction.suggestedScanPriority)}>
              {prediction.suggestedScanPriority}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            Risk Score: {(prediction.riskScore * 100).toFixed(1)}% • 
            Confidence: {(prediction.confidence * 100).toFixed(1)}% • 
            Est. {prediction.estimatedWeakSignatureCount} weak signature{prediction.estimatedWeakSignatureCount !== 1 ? 's' : ''}
          </div>
          {prediction.proximityToKnownWeakness > 0.5 && (
            <div className="text-xs text-orange-400 mt-1">
              ⚠ Near confirmed vulnerabilities ({(prediction.proximityToKnownWeakness * 100).toFixed(0)}% proximity)
            </div>
          )}
        </div>
        <Button
          onClick={() => onScanBlock(prediction.blockNumber)}
          size="sm"
          variant="outline"
        >
          <Crosshair size={14} />
          Scan
        </Button>
      </div>

      {prediction.predictedVulnerabilities.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">
              Predicted Vulnerabilities:
            </div>
            {prediction.predictedVulnerabilities.map((vuln, idx) => (
              <VulnerabilityItem
                key={idx}
                vulnerability={vuln}
                getVulnerabilityColor={getVulnerabilityColor}
              />
            ))}
          </div>
        </>
      )}

      {prediction.reasoning.length > 0 && (
        <>
          <Separator />
          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground">Reasoning:</div>
            <ul className="space-y-0.5">
              {prediction.reasoning.map((reason, idx) => (
                <li key={idx} className="text-xs text-muted-foreground pl-3 relative">
                  <span className="absolute left-0">•</span>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

interface VulnerabilityItemProps {
  vulnerability: PredictedVulnerability
  getVulnerabilityColor: (type: string) => string
}

function VulnerabilityItem({ vulnerability, getVulnerabilityColor }: VulnerabilityItemProps) {
  return (
    <div className="bg-background/50 p-2 rounded text-xs">
      <div className="flex items-center justify-between mb-1">
        <span className={`font-semibold ${getVulnerabilityColor(vulnerability.type)}`}>
          {vulnerability.type.toUpperCase()}
        </span>
        <span className="text-muted-foreground">
          {(vulnerability.probability * 100).toFixed(0)}%
        </span>
      </div>
      <div className="text-muted-foreground mb-1">{vulnerability.reasoning}</div>
      {vulnerability.expectedAddresses.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-2">
          {vulnerability.expectedAddresses.slice(0, 3).map((addr, idx) => (
            <Badge key={idx} variant="outline" className="text-[10px] font-mono">
              {addr.slice(0, 6)}...{addr.slice(-4)}
            </Badge>
          ))}
          {vulnerability.expectedAddresses.length > 3 && (
            <Badge variant="outline" className="text-[10px]">
              +{vulnerability.expectedAddresses.length - 3} more
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
