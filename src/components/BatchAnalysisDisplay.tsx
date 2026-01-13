import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  ChartLine, 
  Warning, 
  CheckCircle, 
  XCircle, 
  Lightning,
  ChartBar,
  ListChecks,
  Clock
} from '@phosphor-icons/react'
import { BatchAnalysisResult, SignatureCluster, StatisticalPattern } from '@/lib/batch-analysis'

interface BatchAnalysisDisplayProps {
  analysis: BatchAnalysisResult
  onGenerateAttack: (cluster: SignatureCluster) => void
}

export function BatchAnalysisDisplay({ analysis, onGenerateAttack }: BatchAnalysisDisplayProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
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

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle size={20} weight="fill" className="text-destructive" />
      case 'high':
        return <Warning size={20} weight="fill" className="text-orange-400" />
      case 'medium':
        return <Warning size={20} weight="fill" className="text-yellow-400" />
      case 'low':
        return <CheckCircle size={20} weight="fill" className="text-blue-400" />
      default:
        return null
    }
  }

  const getPatternIcon = (pattern: string) => {
    switch (pattern) {
      case 'nonce-reuse':
        return <Lightning size={16} weight="fill" />
      case 'sequential-nonce':
      case 'temporal-correlation':
        return <Clock size={16} />
      case 'biased-lsb':
      case 'biased-msb':
        return <ChartBar size={16} />
      case 'address-clustering':
        return <ChartLine size={16} />
      default:
        return <Warning size={16} />
    }
  }

  const criticalCount = analysis.clusters.filter(c => c.severity === 'critical').length
  const highCount = analysis.clusters.filter(c => c.severity === 'high').length
  const mediumCount = analysis.clusters.filter(c => c.severity === 'medium').length
  const lowCount = analysis.clusters.filter(c => c.severity === 'low').length

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ChartLine size={24} className="text-accent" weight="bold" />
          <h2 className="text-lg font-semibold">Batch Analysis Results</h2>
        </div>
        <Badge variant="outline" className="text-xs">
          {analysis.totalSignatures} signatures analyzed in {(analysis.analysisTime / 1000).toFixed(2)}s
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-secondary/30 rounded-lg border border-border">
          <div className="text-2xl font-bold mb-1">{analysis.totalSignatures}</div>
          <div className="text-xs text-muted-foreground">Total Signatures</div>
        </div>
        <div className="p-4 bg-secondary/30 rounded-lg border border-border">
          <div className="text-2xl font-bold mb-1">{analysis.uniqueAddresses}</div>
          <div className="text-xs text-muted-foreground">Unique Addresses</div>
        </div>
        <div className="p-4 bg-secondary/30 rounded-lg border border-border">
          <div className="text-2xl font-bold mb-1 text-accent">{analysis.clusters.length}</div>
          <div className="text-xs text-muted-foreground">Pattern Clusters</div>
        </div>
        <div className="p-4 bg-secondary/30 rounded-lg border border-border">
          <div className="text-2xl font-bold mb-1 text-accent">{analysis.statisticalPatterns.length}</div>
          <div className="text-xs text-muted-foreground">Statistical Patterns</div>
        </div>
      </div>

      {(criticalCount > 0 || highCount > 0) && (
        <Alert className="mb-6 border-destructive bg-destructive/10">
          <XCircle size={16} weight="fill" className="text-destructive" />
          <AlertDescription className="text-xs ml-2">
            <strong>Vulnerabilities Detected:</strong>{' '}
            {criticalCount > 0 && `${criticalCount} critical`}
            {criticalCount > 0 && highCount > 0 && ', '}
            {highCount > 0 && `${highCount} high severity`}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="clusters" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="clusters">
            <ChartLine size={16} className="mr-2" />
            Clusters ({analysis.clusters.length})
          </TabsTrigger>
          <TabsTrigger value="patterns">
            <ChartBar size={16} className="mr-2" />
            Patterns ({analysis.statisticalPatterns.length})
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            <ListChecks size={16} className="mr-2" />
            Recommendations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clusters" className="space-y-4">
          {analysis.clusters.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle size={48} className="mx-auto mb-4 text-success" weight="fill" />
              <h3 className="text-sm font-semibold mb-2">No Pattern Clusters Detected</h3>
              <p className="text-xs text-muted-foreground">
                All signatures appear to be using proper randomness
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {analysis.clusters.map((cluster, idx) => (
                  <div
                    key={cluster.id}
                    className="border border-border rounded-lg p-4 bg-card/50 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {getSeverityIcon(cluster.severity)}
                        <Badge variant="outline" className={`text-xs ${getSeverityColor(cluster.severity)}`}>
                          {cluster.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Confidence: {(cluster.confidence * 100).toFixed(0)}%
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {getPatternIcon(cluster.pattern)}
                      <Badge variant="outline" className="text-xs">
                        {cluster.pattern.replace(/-/g, ' ').toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="text-xs bg-secondary">
                        {cluster.signatures.length} signatures
                      </Badge>
                      {cluster.addressCount > 1 && (
                        <Badge variant="outline" className="text-xs bg-primary/10">
                          {cluster.addressCount} addresses
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm">{cluster.description}</p>

                    {cluster.timeSpan && cluster.timeSpan > 0 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock size={14} />
                        Time span: {(cluster.timeSpan / 3600).toFixed(2)} hours
                      </div>
                    )}

                    <Separator />

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground">Metadata:</div>
                      <div className="bg-secondary/50 p-3 rounded text-xs font-mono space-y-1">
                        {Object.entries(cluster.metadata).map(([key, value]) => (
                          <div key={key}>
                            <span className="text-muted-foreground">{key}:</span>{' '}
                            <span className="text-foreground">
                              {typeof value === 'object' && value !== null 
                                ? JSON.stringify(value, null, 2)
                                : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Button
                      onClick={() => onGenerateAttack(cluster)}
                      size="sm"
                      className="w-full"
                      variant="default"
                    >
                      <Lightning size={16} weight="fill" className="mr-2" />
                      Generate Attack from Cluster
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="patterns" className="space-y-4">
          {analysis.statisticalPatterns.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle size={48} className="mx-auto mb-4 text-success" weight="fill" />
              <h3 className="text-sm font-semibold mb-2">No Statistical Anomalies</h3>
              <p className="text-xs text-muted-foreground">
                Signature values show expected statistical properties
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {analysis.statisticalPatterns.map((pattern, idx) => (
                <Card key={idx} className="p-4 bg-card/50 border-border">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ChartBar size={18} className="text-accent" />
                      <Badge variant="outline" className="text-xs">
                        {pattern.type.replace(/-/g, ' ').toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground mb-1">Significance</div>
                      <Progress 
                        value={pattern.statisticalSignificance * 100} 
                        className="h-2 w-24"
                      />
                    </div>
                  </div>

                  <p className="text-sm mb-3">{pattern.description}</p>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div>
                      <span className="font-semibold">{pattern.affectedSignatures}</span> affected
                    </div>
                    <div>
                      <span className="font-semibold">
                        {(pattern.statisticalSignificance * 100).toFixed(1)}%
                      </span>{' '}
                      significance
                    </div>
                  </div>

                  <Separator className="my-3" />

                  <div className="bg-secondary/50 p-3 rounded text-xs font-mono space-y-1">
                    {Object.entries(pattern.details).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-muted-foreground">{key}:</span>{' '}
                        <span className="text-foreground">
                          {typeof value === 'number' ? value.toFixed(4) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <Card className="p-4 bg-card/50 border-border">
            <div className="flex items-center gap-2 mb-4">
              <ListChecks size={20} className="text-accent" weight="bold" />
              <h3 className="text-sm font-semibold">Attack Recommendations</h3>
            </div>

            <div className="space-y-3">
              {analysis.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    rec.startsWith('CRITICAL') 
                      ? 'bg-destructive/10 border-destructive/20' 
                      : rec.startsWith('HIGH')
                      ? 'bg-orange-500/10 border-orange-500/20'
                      : 'bg-secondary/50 border-border'
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold mt-0.5">
                      {idx + 1}
                    </div>
                    <p className="text-sm flex-1">{rec}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {(criticalCount > 0 || highCount > 0) && (
            <Alert className="border-accent bg-accent/10">
              <Lightning size={16} weight="fill" className="text-accent" />
              <AlertDescription className="text-xs ml-2">
                <strong>Quick Start:</strong> Select a cluster from the "Clusters" tab and click 
                "Generate Attack from Cluster" to automatically configure the optimal lattice reduction attack.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  )
}
