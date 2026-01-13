import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Flame, Target } from '@phosphor-icons/react'

interface RiskHeatmapProps {
  heatmap: { blockNumber: number; riskScore: number }[]
  onSelectBlock: (blockNumber: number) => void
}

export function RiskHeatmap({ heatmap, onSelectBlock }: RiskHeatmapProps) {
  const maxRisk = Math.max(...heatmap.map(h => h.riskScore))
  const minRisk = Math.min(...heatmap.map(h => h.riskScore))
  
  const getRiskColor = (riskScore: number): string => {
    const normalized = (riskScore - minRisk) / (maxRisk - minRisk || 1)
    
    if (normalized > 0.75) return 'bg-destructive'
    if (normalized > 0.5) return 'bg-orange-500'
    if (normalized > 0.25) return 'bg-yellow-500'
    return 'bg-blue-500'
  }

  const getRiskColorHover = (riskScore: number): string => {
    const normalized = (riskScore - minRisk) / (maxRisk - minRisk || 1)
    
    if (normalized > 0.75) return 'bg-destructive hover:bg-destructive/80'
    if (normalized > 0.5) return 'bg-orange-500 hover:bg-orange-500/80'
    if (normalized > 0.25) return 'bg-yellow-500 hover:bg-yellow-500/80'
    return 'bg-blue-500 hover:bg-blue-500/80'
  }

  const getRiskLabel = (riskScore: number) => {
    if (riskScore > 0.7) return 'Critical'
    if (riskScore > 0.5) return 'High'
    if (riskScore > 0.3) return 'Medium'
    return 'Low'
  }

  const topRisks = [...heatmap]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10)

  const blockGroups: { start: number; end: number; avgRisk: number; count: number }[] = []
  let currentGroup: number[] = []
  
  for (let i = 0; i < heatmap.length; i++) {
    if (i === 0 || heatmap[i].blockNumber - heatmap[i - 1].blockNumber <= 10) {
      currentGroup.push(i)
    } else {
      if (currentGroup.length > 0) {
        const start = heatmap[currentGroup[0]].blockNumber
        const end = heatmap[currentGroup[currentGroup.length - 1]].blockNumber
        const avgRisk = currentGroup.reduce((sum, idx) => sum + heatmap[idx].riskScore, 0) / currentGroup.length
        blockGroups.push({ start, end, avgRisk, count: currentGroup.length })
      }
      currentGroup = [i]
    }
  }
  
  if (currentGroup.length > 0) {
    const start = heatmap[currentGroup[0]].blockNumber
    const end = heatmap[currentGroup[currentGroup.length - 1]].blockNumber
    const avgRisk = currentGroup.reduce((sum, idx) => sum + heatmap[idx].riskScore, 0) / currentGroup.length
    blockGroups.push({ start, end, avgRisk, count: currentGroup.length })
  }

  return (
    <div className="space-y-4">
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center gap-3 mb-4">
          <Flame size={24} className="text-orange-500" weight="fill" />
          <div>
            <h3 className="text-base font-semibold">Risk Heatmap</h3>
            <p className="text-xs text-muted-foreground">
              Visual representation of vulnerability risk across block range
            </p>
          </div>
        </div>

        <div className="grid grid-cols-10 gap-1 mb-4">
          {heatmap.slice(0, 100).map((item) => (
            <button
              key={item.blockNumber}
              onClick={() => onSelectBlock(item.blockNumber)}
              className={`h-8 rounded transition-all ${getRiskColorHover(item.riskScore)} group relative`}
              title={`Block ${item.blockNumber}: ${getRiskLabel(item.riskScore)} Risk (${(item.riskScore * 100).toFixed(0)}%)`}
            >
              <span className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-popover border border-border px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                {item.blockNumber}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs mb-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded" />
            <span className="text-muted-foreground">Low Risk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500 rounded" />
            <span className="text-muted-foreground">Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-500 rounded" />
            <span className="text-muted-foreground">High</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-destructive rounded" />
            <span className="text-muted-foreground">Critical</span>
          </div>
        </div>

        {heatmap.length > 100 && (
          <p className="text-xs text-muted-foreground text-center">
            Showing first 100 of {heatmap.length} blocks. Scroll to top risks below for full details.
          </p>
        )}
      </Card>

      <Card className="p-6 bg-card border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Top Risk Blocks</h3>
          <Badge variant="outline" className="text-xs">
            {topRisks.length} highest risk
          </Badge>
        </div>

        <div className="space-y-2">
          {topRisks.map((item) => (
            <div
              key={item.blockNumber}
              className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border/50"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${getRiskColor(item.riskScore)}`} />
                <div>
                  <div className="font-mono text-sm font-semibold">
                    Block {item.blockNumber.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Risk Score: {(item.riskScore * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              <Button
                onClick={() => onSelectBlock(item.blockNumber)}
                size="sm"
                variant="outline"
              >
                <Target size={14} />
                Select
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {blockGroups.length > 1 && (
        <Card className="p-6 bg-card border-border">
          <h3 className="text-base font-semibold mb-4">Risk Clusters</h3>
          <div className="space-y-2">
            {blockGroups
              .sort((a, b) => b.avgRisk - a.avgRisk)
              .slice(0, 5)
              .map((group, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border/50"
                >
                  <div>
                    <div className="font-mono text-sm font-semibold">
                      Blocks {group.start.toLocaleString()} - {group.end.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {group.count} blocks • Avg risk: {(group.avgRisk * 100).toFixed(1)}%
                    </div>
                  </div>
                  <Button
                    onClick={() => onSelectBlock(group.start)}
                    size="sm"
                    variant="outline"
                  >
                    Scan Range
                  </Button>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  )
}
