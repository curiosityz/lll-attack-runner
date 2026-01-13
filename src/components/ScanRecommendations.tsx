import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ListChecks, Play, Sparkle, Clock } from '@phosphor-icons/react'
import { ScanRecommendation } from '@/lib/ml-predictor'

interface ScanRecommendationsProps {
  recommendations: ScanRecommendation[]
  onScanRecommendation: (from: number, to: number) => void
  onAutoScanAll: (recommendations: ScanRecommendation[]) => void
}

export function ScanRecommendations({ 
  recommendations, 
  onScanRecommendation,
  onAutoScanAll 
}: ScanRecommendationsProps) {
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

  const totalExpectedVulnerabilities = recommendations.reduce(
    (sum, rec) => sum + rec.expectedVulnerabilities,
    0
  )

  const totalEstimatedTime = recommendations.reduce(
    (sum, rec) => sum + rec.estimatedScanTime,
    0
  )

  const criticalRecs = recommendations.filter(r => r.priority === 'critical')
  const highRecs = recommendations.filter(r => r.priority === 'high')

  return (
    <div className="space-y-4">
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center gap-3 mb-4">
          <ListChecks size={24} className="text-accent" weight="fill" />
          <div>
            <h3 className="text-base font-semibold">Smart Scan Recommendations</h3>
            <p className="text-xs text-muted-foreground">
              ML-optimized scan strategy for maximum vulnerability detection
            </p>
          </div>
        </div>

        {recommendations.length === 0 ? (
          <div className="text-center py-8">
            <ListChecks size={48} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold mb-2">No Recommendations Available</h3>
            <p className="text-xs text-muted-foreground">
              Generate ML predictions to receive smart scan recommendations
            </p>
          </div>
        ) : (
          <>
            <Alert className="mb-4 bg-accent/10 border-accent/20">
              <Sparkle size={16} className="text-accent" weight="fill" />
              <AlertDescription className="text-xs">
                <strong>Scan Strategy:</strong> Found {recommendations.length} recommended scan{recommendations.length !== 1 ? 's' : ''} targeting {totalExpectedVulnerabilities} potential vulnerabilit{totalExpectedVulnerabilities !== 1 ? 'ies' : 'y'}. 
                Estimated total time: {Math.ceil(totalEstimatedTime / 60)} minute{Math.ceil(totalEstimatedTime / 60) !== 1 ? 's' : ''}.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-secondary/50 p-3 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Critical Areas</div>
                <div className="text-xl font-bold text-destructive">{criticalRecs.length}</div>
              </div>
              <div className="bg-secondary/50 p-3 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">High Priority</div>
                <div className="text-xl font-bold text-orange-400">{highRecs.length}</div>
              </div>
              <div className="bg-secondary/50 p-3 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Est. Vulns</div>
                <div className="text-xl font-bold">{totalExpectedVulnerabilities}</div>
              </div>
            </div>

            {(criticalRecs.length > 0 || highRecs.length > 0) && (
              <Button
                onClick={() => onAutoScanAll(recommendations.filter(
                  r => r.priority === 'critical' || r.priority === 'high'
                ))}
                className="w-full mb-4"
                size="lg"
              >
                <Play size={16} weight="fill" />
                Auto-Scan All Priority Areas
              </Button>
            )}

            <div className="space-y-3">
              {recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="border border-border rounded-lg p-4 bg-secondary/20 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getPriorityColor(rec.priority)}>
                          {rec.priority}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Recommendation #{idx + 1}
                        </span>
                      </div>
                      <div className="font-mono text-sm font-semibold mb-1">
                        Blocks {rec.blocks[0].toLocaleString()} - {rec.blocks[rec.blocks.length - 1].toLocaleString()}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {rec.reason}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-background/50 p-2 rounded">
                      <div className="text-muted-foreground mb-1">Blocks</div>
                      <div className="font-semibold">{rec.blocks.length}</div>
                    </div>
                    <div className="bg-background/50 p-2 rounded">
                      <div className="text-muted-foreground mb-1">Est. Vulns</div>
                      <div className="font-semibold">{rec.expectedVulnerabilities}</div>
                    </div>
                    <div className="bg-background/50 p-2 rounded">
                      <div className="text-muted-foreground mb-1 flex items-center gap-1">
                        <Clock size={12} />
                        Time
                      </div>
                      <div className="font-semibold">{Math.ceil(rec.estimatedScanTime / 60)}m</div>
                    </div>
                  </div>

                  <Button
                    onClick={() => onScanRecommendation(rec.blocks[0], rec.blocks[rec.blocks.length - 1])}
                    size="sm"
                    className="w-full"
                    variant="outline"
                  >
                    <Play size={14} />
                    Scan This Range
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
