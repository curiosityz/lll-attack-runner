import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  CheckCircle, 
  XCircle, 
  ArrowsClockwise, 
  Info,
  Lightning,
  Timer
} from '@phosphor-icons/react'
import { corsProxyManager, CORS_PROXIES } from '@/lib/cors-proxy'
import { toast } from 'sonner'

export function CORSProxyStatus() {
  const [stats, setStats] = useState(corsProxyManager.getStats())
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refreshStats = () => {
    setStats(corsProxyManager.getStats())
  }

  useEffect(() => {
    const interval = setInterval(() => {
      refreshStats()
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  const handleReset = () => {
    setIsRefreshing(true)
    corsProxyManager.reset()
    setTimeout(() => {
      refreshStats()
      setIsRefreshing(false)
      toast.success('CORS proxy manager reset successfully')
    }, 500)
  }

  const currentProxy = corsProxyManager.getCurrentProxy()

  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Lightning size={18} className="text-accent" weight="fill" />
          <h3 className="text-sm font-semibold">CORS Proxy Status</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isRefreshing}
          >
            <ArrowsClockwise size={14} className={isRefreshing ? 'animate-spin' : ''} />
            Reset
          </Button>
        </div>
      </div>

      <Alert className="mb-3 bg-accent/10 border-accent/20">
        <Info size={16} className="text-accent" />
        <AlertDescription className="text-xs">
          <strong>Active Proxy:</strong> {currentProxy.name}
          <br />
          <span className="text-muted-foreground">{currentProxy.description}</span>
        </AlertDescription>
      </Alert>

      <ScrollArea className="h-[200px]">
        <div className="space-y-2">
          {CORS_PROXIES.map((proxy) => {
            const stat = stats.find(s => s.proxy === proxy.name)
            const isActive = currentProxy.name === proxy.name
            const hasFailures = stat && stat.failures > 0
            const isHealthy = stat && stat.totalRequests > 0 && stat.failures === 0

            return (
              <div
                key={proxy.name}
                className={`p-3 rounded-lg border transition-all ${
                  isActive 
                    ? 'bg-accent/10 border-accent/30' 
                    : 'bg-secondary/30 border-border'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{proxy.name}</span>
                    {isActive && (
                      <Badge variant="default" className="text-xs">
                        Active
                      </Badge>
                    )}
                    {isHealthy && !isActive && (
                      <CheckCircle size={14} className="text-success" weight="fill" />
                    )}
                    {hasFailures && (
                      <XCircle size={14} className="text-destructive" weight="fill" />
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Priority {proxy.priority}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground mb-2">
                  {proxy.description}
                </p>

                {stat && (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Requests</div>
                      <div className="font-semibold">{stat.totalRequests}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Failures</div>
                      <div className={`font-semibold ${stat.failures > 0 ? 'text-destructive' : 'text-success'}`}>
                        {stat.failures}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground flex items-center gap-1">
                        <Timer size={10} />
                        Avg Time
                      </div>
                      <div className="font-semibold">
                        {stat.avgResponseTime > 0 ? `${stat.avgResponseTime}ms` : '-'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <Separator className="my-3" />

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>How it works:</strong></p>
        <ul className="list-disc list-inside space-y-0.5 ml-2">
          <li>Automatically rotates through proxies on failure</li>
          <li>Blacklists failing proxies for 5 minutes</li>
          <li>Prioritizes proxies with better success rates</li>
          <li>All RPC requests use active proxy automatically</li>
        </ul>
      </div>
    </Card>
  )
}
