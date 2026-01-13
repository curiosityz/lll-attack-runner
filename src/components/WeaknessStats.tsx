import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { 
  Warning, 
  Target, 
  TrendUp,
  ShieldWarning,
  CheckCircle
} from '@phosphor-icons/react'
import type { AutomationHistory } from '@/lib/automation'

interface WeaknessStatsProps {
  history: AutomationHistory[]
}

interface WeaknessTypeStats {
  type: string
  count: number
  percentage: number
  severity: 'critical' | 'high' | 'medium' | 'low'
}

export function WeaknessStats({ history }: WeaknessStatsProps) {
  const stats = useMemo(() => {
    const weaknessByType: Record<string, number> = {}
    let totalWeaknesses = 0
    let totalBlocks = 0
    let totalScans = 0
    let scansWithWeaknesses = 0

    for (const entry of history) {
      if (entry.blocksScanned) {
        totalScans++
        totalBlocks += entry.blocksScanned.to - entry.blocksScanned.from + 1
        
        if (entry.weaknessesFound && entry.weaknessesFound > 0) {
          scansWithWeaknesses++
        }
        
        if (entry.weaknessesByType) {
          Object.entries(entry.weaknessesByType).forEach(([type, count]) => {
            weaknessByType[type] = (weaknessByType[type] || 0) + count
            totalWeaknesses += count
          })
        }
      }
    }

    const weaknessTypes: WeaknessTypeStats[] = Object.entries(weaknessByType)
      .map(([type, count]) => ({
        type,
        count,
        percentage: totalWeaknesses > 0 ? (count / totalWeaknesses) * 100 : 0,
        severity: getSeverity(type)
      }))
      .sort((a, b) => b.count - a.count)

    return {
      weaknessTypes,
      totalWeaknesses,
      totalBlocks,
      totalScans,
      scansWithWeaknesses,
      weaknessRate: totalBlocks > 0 ? (totalWeaknesses / totalBlocks) * 100 : 0,
      scanSuccessRate: totalScans > 0 ? (scansWithWeaknesses / totalScans) * 100 : 0
    }
  }, [history])

  const getSeverity = (type: string): 'critical' | 'high' | 'medium' | 'low' => {
    const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
      'nonce-reuse': 'critical',
      'small-r': 'critical',
      'biased-nonce': 'high',
      'similar-k': 'high',
      'high-s': 'low'
    }
    return severityMap[type] || 'medium'
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/10 text-red-500 border-red-500/30'
      case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/30'
      case 'medium': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30'
      case 'low': return 'bg-blue-500/10 text-blue-500 border-blue-500/30'
      default: return 'bg-muted-foreground/10 text-muted-foreground border-border/30'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <ShieldWarning size={14} weight="fill" />
      case 'high': return <Warning size={14} weight="fill" />
      case 'medium': return <Target size={14} />
      case 'low': return <TrendUp size={14} />
      default: return <Warning size={14} />
    }
  }

  if (stats.totalWeaknesses === 0) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="text-center py-12">
          <CheckCircle size={48} className="mx-auto mb-4 text-success" weight="fill" />
          <h3 className="text-sm font-semibold mb-2">No Weaknesses Detected</h3>
          <p className="text-xs text-muted-foreground">
            All scanned blocks appear to be secure
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center gap-3 mb-4">
        <Warning size={20} className="text-destructive" weight="fill" />
        <h3 className="text-sm font-semibold">Weakness Analysis</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 bg-destructive/5 rounded border border-destructive/20">
          <div className="text-[10px] text-muted-foreground mb-1">Total Weaknesses</div>
          <div className="text-2xl font-bold text-destructive">{stats.totalWeaknesses}</div>
        </div>
        <div className="p-3 bg-secondary/20 rounded border border-border/50">
          <div className="text-[10px] text-muted-foreground mb-1">Weakness Rate</div>
          <div className="text-2xl font-bold">
            {stats.weaknessRate < 0.01 ? '<0.01' : stats.weaknessRate.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="mb-4 p-3 bg-secondary/20 rounded border border-border/50">
        <div className="text-xs font-medium mb-2">Detection Rate</div>
        <div className="flex items-center gap-3">
          <Progress value={stats.scanSuccessRate} className="flex-1" />
          <span className="text-xs font-mono">
            {stats.scansWithWeaknesses}/{stats.totalScans} scans
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {stats.scanSuccessRate.toFixed(1)}% of scans found weaknesses
        </p>
      </div>

      <Separator className="my-4" />

      <div className="space-y-3">
        <div className="text-xs font-medium mb-2">Weakness Types</div>
        {stats.weaknessTypes.map((weakness) => (
          <div key={weakness.type} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge 
                  variant="outline" 
                  className={`text-[10px] ${getSeverityColor(weakness.severity)}`}
                >
                  {getSeverityIcon(weakness.severity)}
                  <span className="ml-1 uppercase">{weakness.severity}</span>
                </Badge>
                <span className="text-xs font-medium">{weakness.type}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">
                  {weakness.percentage.toFixed(1)}%
                </span>
                <span className="text-xs font-bold">
                  {weakness.count}
                </span>
              </div>
            </div>
            <Progress value={weakness.percentage} className="h-1.5" />
          </div>
        ))}
      </div>

      <Separator className="my-4" />

      <div className="text-[10px] text-muted-foreground space-y-1">
        <p><strong>Critical:</strong> Immediate key recovery possible</p>
        <p><strong>High:</strong> Exploitable with lattice reduction</p>
        <p><strong>Medium:</strong> Potential weakness requiring analysis</p>
        <p><strong>Low:</strong> Best practice violation</p>
      </div>
    </Card>
  )
}
