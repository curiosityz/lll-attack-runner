import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { 
  CheckCircle, 
  Warning, 
  XCircle, 
  Lightning, 
  ChartBar,
  Target,
  TrendUp
} from '@phosphor-icons/react'
import { AnalysisResult, WeakSignature, PatternCluster } from '@/lib/signatureAnalyzer'
import { AlgorithmType } from '@/lib/types'

interface AnalysisDisplayProps {
  result: AnalysisResult
  onGenerateAttack: (
    weakness: WeakSignature | PatternCluster,
    type: 'weakness' | 'pattern'
  ) => void
  isAnalyzing: boolean
}

function getSeverityColor(severity: 'critical' | 'high' | 'medium' | 'low'): string {
  switch (severity) {
    case 'critical': return 'text-destructive'
    case 'high': return 'text-warning'
    case 'medium': return 'text-accent'
    case 'low': return 'text-muted-foreground'
  }
}

function getSeverityBg(severity: 'critical' | 'high' | 'medium' | 'low'): string {
  switch (severity) {
    case 'critical': return 'bg-destructive/10 border-destructive/50'
    case 'high': return 'bg-warning/10 border-warning/50'
    case 'medium': return 'bg-accent/10 border-accent/50'
    case 'low': return 'bg-muted/50 border-border/50'
  }
}

export function AnalysisDisplay({ result, onGenerateAttack, isAnalyzing }: AnalysisDisplayProps) {
  const criticalCount = result.weakSignatures.filter(w => w.severity === 'critical').length
  const highCount = result.weakSignatures.filter(w => w.severity === 'high').length
  const mediumCount = result.weakSignatures.filter(w => w.severity === 'medium').length
  const lowCount = result.weakSignatures.filter(w => w.severity === 'low').length

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
          <span className="w-1 h-6 bg-primary rounded-full"></span>
          Analysis Results
        </h2>

        {isAnalyzing ? (
          <div className="py-12 text-center">
            <div className="inline-flex p-6 rounded-2xl bg-primary/10 mb-4">
              <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full" />
            </div>
            <p className="text-sm text-muted-foreground">Analyzing signatures...</p>
          </div>
        ) : result.totalAnalyzed === 0 ? (
          <div className="py-12 text-center">
            <div className="inline-flex p-6 rounded-2xl bg-muted/30 mb-4">
              <ChartBar size={48} weight="duotone" className="text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-bold mb-2">No Data to Analyze</h3>
            <p className="text-sm text-muted-foreground">Upload transaction data to begin analysis</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
                <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Total</div>
                <div className="text-2xl font-bold text-foreground">{result.totalAnalyzed}</div>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
                <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Addresses</div>
                <div className="text-2xl font-bold text-accent">{result.statistics.uniqueAddresses}</div>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
                <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Weaknesses</div>
                <div className="text-2xl font-bold text-warning">{result.weakSignatures.length}</div>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
                <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Patterns</div>
                <div className="text-2xl font-bold text-primary">{result.patterns.length}</div>
              </div>
            </div>

            {(criticalCount > 0 || highCount > 0) && (
              <Alert className="border-warning/50 bg-warning/10 mb-6">
                <AlertDescription className="flex items-center gap-2">
                  <Warning size={18} weight="fill" className="text-warning" />
                  <span className="font-medium">
                    {criticalCount > 0 && `${criticalCount} critical `}
                    {highCount > 0 && `${highCount} high severity `}
                    {criticalCount > 0 || highCount > 0 ? 'vulnerabilities detected!' : ''}
                  </span>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {criticalCount > 0 && (
                <div className={`p-3 rounded-lg border ${getSeverityBg('critical')}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase">Critical</span>
                    <XCircle size={16} weight="fill" className={getSeverityColor('critical')} />
                  </div>
                  <div className={`text-xl font-bold mt-1 ${getSeverityColor('critical')}`}>
                    {criticalCount}
                  </div>
                </div>
              )}
              {highCount > 0 && (
                <div className={`p-3 rounded-lg border ${getSeverityBg('high')}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase">High</span>
                    <Warning size={16} weight="fill" className={getSeverityColor('high')} />
                  </div>
                  <div className={`text-xl font-bold mt-1 ${getSeverityColor('high')}`}>
                    {highCount}
                  </div>
                </div>
              )}
              {mediumCount > 0 && (
                <div className={`p-3 rounded-lg border ${getSeverityBg('medium')}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase">Medium</span>
                    <Target size={16} weight="duotone" className={getSeverityColor('medium')} />
                  </div>
                  <div className={`text-xl font-bold mt-1 ${getSeverityColor('medium')}`}>
                    {mediumCount}
                  </div>
                </div>
              )}
              {lowCount > 0 && (
                <div className={`p-3 rounded-lg border ${getSeverityBg('low')}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase">Low</span>
                    <CheckCircle size={16} weight="duotone" className={getSeverityColor('low')} />
                  </div>
                  <div className={`text-xl font-bold mt-1 ${getSeverityColor('low')}`}>
                    {lowCount}
                  </div>
                </div>
              )}
            </div>

            <Separator className="my-6" />

            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <TrendUp size={16} weight="duotone" />
                Statistical Analysis
              </h3>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-lg bg-secondary/30 border border-border/40">
                  <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">R-Value Distribution</div>
                  <div className="space-y-1 text-xs font-mono">
                    <div>Min: {result.statistics.rValueDistribution.min.toString().slice(0, 20)}...</div>
                    <div>Max: {result.statistics.rValueDistribution.max.toString().slice(0, 20)}...</div>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-secondary/30 border border-border/40">
                  <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Bit Bias</div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>LSB Bias</span>
                        <span className="font-bold">{(result.statistics.bitBias.lsb * 100).toFixed(1)}%</span>
                      </div>
                      <Progress 
                        value={Math.min(result.statistics.bitBias.lsb * 100, 100)} 
                        className="h-1.5"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>MSB Bias</span>
                        <span className="font-bold">{(result.statistics.bitBias.msb * 100).toFixed(1)}%</span>
                      </div>
                      <Progress 
                        value={Math.min(result.statistics.bitBias.msb * 100, 100)} 
                        className="h-1.5"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {result.weakSignatures.length > 0 && (
              <>
                <Separator className="my-6" />
                <div>
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <Lightning size={16} weight="duotone" />
                    Individual Weaknesses ({result.weakSignatures.length})
                  </h3>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {result.weakSignatures.map((weakness, idx) => (
                        <div
                          key={idx}
                          className={`p-4 rounded-lg border ${getSeverityBg(weakness.severity)}`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs font-mono">
                                  {weakness.weakness}
                                </Badge>
                                <Badge 
                                  variant="secondary"
                                  className={`text-xs ${getSeverityColor(weakness.severity)}`}
                                >
                                  {weakness.severity}
                                </Badge>
                              </div>
                              <p className="text-sm leading-relaxed">{weakness.description}</p>
                              <div className="mt-2 text-xs font-mono text-muted-foreground">
                                <div>Tx: {weakness.signature.hash.slice(0, 20)}...</div>
                                <div>Address: {weakness.signature.address.slice(0, 20)}...</div>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => onGenerateAttack(weakness, 'weakness')}
                              className="flex-shrink-0 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
                            >
                              <Lightning size={14} weight="fill" />
                              Attack
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </>
            )}

            {result.patterns.length > 0 && (
              <>
                <Separator className="my-6" />
                <div>
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <ChartBar size={16} weight="duotone" />
                    Pattern Clusters ({result.patterns.length})
                  </h3>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {result.patterns.map((pattern, idx) => (
                        <div
                          key={idx}
                          className={`p-4 rounded-lg border ${getSeverityBg(pattern.severity)}`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs font-mono">
                                  {pattern.type}
                                </Badge>
                                <Badge 
                                  variant="secondary"
                                  className={`text-xs ${getSeverityColor(pattern.severity)}`}
                                >
                                  {pattern.severity}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {(pattern.confidence * 100).toFixed(0)}% confidence
                                </Badge>
                              </div>
                              <p className="text-sm leading-relaxed mb-2">{pattern.description}</p>
                              <div className="text-xs text-muted-foreground">
                                {pattern.signatures.length} signatures in cluster
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => onGenerateAttack(pattern, 'pattern')}
                              className="flex-shrink-0 bg-accent/20 hover:bg-accent/30 text-accent border border-accent/30"
                            >
                              <Lightning size={14} weight="fill" />
                              Attack
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
