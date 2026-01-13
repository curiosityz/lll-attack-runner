import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChartLine, Warning, CheckCircle } from '@phosphor-icons/react'
import type { AutomationHistory } from '@/lib/automation'

interface BlockProgressionChartProps {
  history: AutomationHistory[]
}

interface BlockRange {
  from: number
  to: number
  timestamp: number
  weaknesses: number
  weaknessesByType?: Record<string, number>
  attacks: number
  successful: number
}

export function BlockProgressionChart({ history }: BlockProgressionChartProps) {
  const blockRanges = useMemo(() => {
    const ranges: BlockRange[] = []
    
    for (const entry of history) {
      if (entry.blocksScanned) {
        ranges.push({
          from: entry.blocksScanned.from,
          to: entry.blocksScanned.to,
          timestamp: entry.timestamp,
          weaknesses: entry.weaknessesFound || 0,
          weaknessesByType: entry.weaknessesByType,
          attacks: entry.attacksExecuted || 0,
          successful: entry.successfulAttacks || 0
        })
      }
    }
    
    return ranges.sort((a, b) => a.from - b.from)
  }, [history])

  const stats = useMemo(() => {
    if (blockRanges.length === 0) return null

    const totalBlocks = blockRanges.reduce((sum, r) => sum + (r.to - r.from + 1), 0)
    const totalWeaknesses = blockRanges.reduce((sum, r) => sum + r.weaknesses, 0)
    const totalAttacks = blockRanges.reduce((sum, r) => sum + r.attacks, 0)
    const totalSuccessful = blockRanges.reduce((sum, r) => sum + r.successful, 0)
    const minBlock = Math.min(...blockRanges.map(r => r.from))
    const maxBlock = Math.max(...blockRanges.map(r => r.to))
    
    const weaknessByType: Record<string, number> = {}
    blockRanges.forEach(range => {
      if (range.weaknessesByType) {
        Object.entries(range.weaknessesByType).forEach(([type, count]) => {
          weaknessByType[type] = (weaknessByType[type] || 0) + count
        })
      }
    })

    return {
      totalBlocks,
      totalWeaknesses,
      totalAttacks,
      totalSuccessful,
      minBlock,
      maxBlock,
      weaknessByType,
      avgWeaknessPerBlock: totalWeaknesses / totalBlocks,
      successRate: totalAttacks > 0 ? totalSuccessful / totalAttacks : 0
    }
  }, [blockRanges])

  const formatBlockNumber = (num: number) => {
    return num.toLocaleString()
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const getWeaknessColor = (count: number) => {
    if (count === 0) return 'bg-secondary/20 border-border/30'
    if (count <= 2) return 'bg-yellow-500/10 border-yellow-500/30'
    if (count <= 5) return 'bg-orange-500/10 border-orange-500/30'
    return 'bg-destructive/10 border-destructive/30'
  }

  if (blockRanges.length === 0) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="text-center py-12">
          <ChartLine size={48} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold mb-2">No Block Data</h3>
          <p className="text-xs text-muted-foreground">
            Run scans to see block progression and weakness distribution
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center gap-3 mb-4">
        <ChartLine size={20} className="text-accent" weight="bold" />
        <h3 className="text-sm font-semibold">Block Progression & Weakness Timeline</h3>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-3 bg-secondary/20 rounded border border-border/50">
            <div className="text-[10px] text-muted-foreground mb-1">Block Range</div>
            <div className="text-sm font-mono font-semibold">
              {formatBlockNumber(stats.minBlock)} - {formatBlockNumber(stats.maxBlock)}
            </div>
          </div>
          <div className="p-3 bg-secondary/20 rounded border border-border/50">
            <div className="text-[10px] text-muted-foreground mb-1">Total Scanned</div>
            <div className="text-sm font-semibold">{formatBlockNumber(stats.totalBlocks)} blocks</div>
          </div>
          <div className="p-3 bg-secondary/20 rounded border border-border/50">
            <div className="text-[10px] text-muted-foreground mb-1">Weaknesses Found</div>
            <div className="text-sm font-semibold text-destructive">{stats.totalWeaknesses}</div>
          </div>
          <div className="p-3 bg-secondary/20 rounded border border-border/50">
            <div className="text-[10px] text-muted-foreground mb-1">Attack Success</div>
            <div className="text-sm font-semibold text-success">
              {stats.totalSuccessful}/{stats.totalAttacks}
            </div>
          </div>
        </div>
      )}

      {stats && Object.keys(stats.weaknessByType).length > 0 && (
        <div className="mb-4 p-3 bg-secondary/20 rounded border border-border/50">
          <div className="text-xs font-medium mb-2">Weakness Distribution</div>
          <div className="flex items-center gap-2 flex-wrap">
            {Object.entries(stats.weaknessByType)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <Badge key={type} variant="outline" className="text-[10px]">
                  <Warning size={12} className="mr-1" />
                  {type}: {count}
                </Badge>
              ))}
          </div>
        </div>
      )}

      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {blockRanges.map((range, idx) => (
            <div
              key={idx}
              className={`p-3 rounded border ${getWeaknessColor(range.weaknesses)}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono text-xs font-semibold">
                  {formatBlockNumber(range.from)} - {formatBlockNumber(range.to)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {formatTimestamp(range.timestamp)}
                </div>
              </div>

              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground">
                  {range.to - range.from + 1} blocks
                </span>
                {range.weaknesses > 0 ? (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-destructive font-medium">
                      {range.weaknesses} weakness{range.weaknesses !== 1 ? 'es' : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-success flex items-center gap-1">
                      <CheckCircle size={12} weight="fill" />
                      Clean
                    </span>
                  </>
                )}
                {range.attacks > 0 && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-accent">
                      {range.successful}/{range.attacks} attacks succeeded
                    </span>
                  </>
                )}
              </div>

              {range.weaknessesByType && Object.keys(range.weaknessesByType).length > 0 && (
                <div className="mt-2 flex items-center gap-1 flex-wrap">
                  {Object.entries(range.weaknessesByType).map(([type, count]) => (
                    <Badge key={type} variant="outline" className="text-[9px] bg-background/50">
                      {type}: {count}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  )
}
