/**
 * Database Configuration Component
 * 
 * Provides UI for configuring database connection settings
 * and streaming signature data to QuestDB, ClickHouse, or InfluxDB.
 */

import { useState, useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Database, 
  Lightning, 
  CheckCircle, 
  XCircle, 
  Warning, 
  ArrowsClockwise,
  Plugs,
  PlugsConnected,
  CloudArrowUp,
  Table as TableIcon,
  ChartLineUp,
  Trash
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { 
  DatabaseClient, 
  DatabaseConfig, 
  DatabaseType,
  StreamingStats,
  getDatabaseClient 
} from '@/lib/database-client'

interface DatabaseConfigPanelProps {
  onStreamingEnabledChange?: (enabled: boolean) => void
  className?: string
}

export function DatabaseConfigPanel({ onStreamingEnabledChange, className }: DatabaseConfigPanelProps) {
  // Persisted configuration
  const [savedConfig, setSavedConfig] = useKV<DatabaseConfig | null>('database-config', null)
  const [streamingEnabled, setStreamingEnabled] = useKV<boolean>('database-streaming-enabled', false)
  
  // Local state
  const [dbType, setDbType] = useState<DatabaseType>('questdb')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('9000')
  const [database, setDatabase] = useState('crypto_signatures')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [useTLS, setUseTLS] = useState(false)
  
  // InfluxDB specific
  const [org, setOrg] = useState('default')
  const [bucket, setBucket] = useState('crypto')
  const [token, setToken] = useState('')
  
  // Connection state
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [connectionMessage, setConnectionMessage] = useState('')
  const [latency, setLatency] = useState<number | null>(null)
  
  // Stats
  const [stats, setStats] = useState<StreamingStats | null>(null)
  
  // Initialize from saved config
  useEffect(() => {
    if (savedConfig) {
      setDbType(savedConfig.type)
      setHost(savedConfig.host)
      setPort(savedConfig.port.toString())
      setDatabase(savedConfig.database || 'crypto_signatures')
      setUsername(savedConfig.username || '')
      setPassword(savedConfig.password || '')
      setUseTLS(savedConfig.useTLS)
      setOrg(savedConfig.org || 'default')
      setBucket(savedConfig.bucket || 'crypto')
      setToken(savedConfig.token || '')
    }
  }, [savedConfig])
  
  // Update stats periodically when streaming is enabled
  useEffect(() => {
    if (streamingEnabled) {
      const updateStats = () => {
        const client = getDatabaseClient()
        setStats(client.getStats())
      }
      
      updateStats()
      const interval = setInterval(updateStats, 5000)
      return () => clearInterval(interval)
    }
  }, [streamingEnabled])
  
  const buildConfig = (): DatabaseConfig => ({
    type: dbType,
    host,
    port: parseInt(port) || 9000,
    database,
    username: username || undefined,
    password: password || undefined,
    useTLS,
    timeout: 30000,
    org: dbType === 'influxdb' ? org : undefined,
    bucket: dbType === 'influxdb' ? bucket : undefined,
    token: dbType === 'influxdb' ? token : undefined
  })
  
  const handleTestConnection = async () => {
    setIsConnecting(true)
    setConnectionStatus('connecting')
    setConnectionMessage('Testing connection...')
    
    try {
      const config = buildConfig()
      const client = new DatabaseClient(config)
      const result = await client.testConnection()
      
      if (result.success) {
        setConnectionStatus('connected')
        setConnectionMessage(result.message)
        setLatency(result.latency || null)
        toast.success('Database connection successful!')
      } else {
        setConnectionStatus('error')
        setConnectionMessage(result.message)
        setLatency(null)
        toast.error(`Connection failed: ${result.message}`)
      }
    } catch (error) {
      setConnectionStatus('error')
      const message = error instanceof Error ? error.message : 'Unknown error'
      setConnectionMessage(`Connection error: ${message}`)
      setLatency(null)
      toast.error(`Connection error: ${message}`)
    } finally {
      setIsConnecting(false)
    }
  }
  
  const handleSaveConfig = () => {
    const config = buildConfig()
    setSavedConfig(config)
    
    // Update the global client
    const client = getDatabaseClient()
    client.updateConfig(config)
    
    toast.success('Database configuration saved')
  }
  
  const handleInitializeSchema = async () => {
    const config = buildConfig()
    const client = new DatabaseClient(config)
    
    const result = await client.initializeSchema()
    if (result.success) {
      toast.success(result.message)
    } else {
      toast.error(result.message)
    }
  }
  
  const handleToggleStreaming = (enabled: boolean) => {
    setStreamingEnabled(enabled)
    onStreamingEnabledChange?.(enabled)
    
    if (enabled) {
      // Initialize client with saved config
      if (savedConfig) {
        const client = getDatabaseClient()
        client.updateConfig(savedConfig)
      }
      toast.success('Database streaming enabled')
    } else {
      toast.info('Database streaming disabled')
    }
  }
  
  const handleResetStats = () => {
    const client = getDatabaseClient()
    client.resetStats()
    setStats(client.getStats())
    toast.success('Statistics reset')
  }
  
  const getPortPlaceholder = () => {
    switch (dbType) {
      case 'questdb': return '9000'
      case 'clickhouse': return '8123'
      case 'influxdb': return '8086'
      default: return '9000'
    }
  }
  
  return (
    <Card className={`p-6 bg-card/80 backdrop-blur-sm border-border/60 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Database size={20} weight="duotone" className="text-primary" />
          Database Streaming
        </h3>
        <div className="flex items-center gap-3">
          <Label htmlFor="streaming-toggle" className="text-sm text-muted-foreground">
            Stream to DB
          </Label>
          <Switch
            id="streaming-toggle"
            checked={streamingEnabled}
            onCheckedChange={handleToggleStreaming}
          />
        </div>
      </div>
      
      {/* Connection Status Banner */}
      {connectionStatus !== 'disconnected' && (
        <Alert className={`mb-4 ${
          connectionStatus === 'connected' ? 'border-success/50 bg-success/10' :
          connectionStatus === 'error' ? 'border-destructive/50 bg-destructive/10' :
          'border-primary/50 bg-primary/10'
        }`}>
          <div className="flex items-center gap-2">
            {connectionStatus === 'connected' && <PlugsConnected size={18} className="text-success" weight="duotone" />}
            {connectionStatus === 'error' && <XCircle size={18} className="text-destructive" weight="duotone" />}
            {connectionStatus === 'connecting' && <ArrowsClockwise size={18} className="text-primary animate-spin" />}
            <AlertDescription className="text-sm">
              {connectionMessage}
              {latency && <span className="ml-2 text-muted-foreground">({latency}ms)</span>}
            </AlertDescription>
          </div>
        </Alert>
      )}
      
      {/* Database Type Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <Label htmlFor="db-type" className="text-sm font-medium mb-2 block">
            Database Type
          </Label>
          <Select value={dbType} onValueChange={(v) => setDbType(v as DatabaseType)}>
            <SelectTrigger id="db-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="questdb">
                <div className="flex items-center gap-2">
                  <Lightning size={16} className="text-primary" />
                  QuestDB (Time-series)
                </div>
              </SelectItem>
              <SelectItem value="clickhouse">
                <div className="flex items-center gap-2">
                  <TableIcon size={16} className="text-accent" />
                  ClickHouse (Columnar)
                </div>
              </SelectItem>
              <SelectItem value="influxdb">
                <div className="flex items-center gap-2">
                  <ChartLineUp size={16} className="text-success" />
                  InfluxDB (Time-series)
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label htmlFor="db-host" className="text-sm font-medium mb-2 block">
            Host
          </Label>
          <Input
            id="db-host"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="localhost"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <Label htmlFor="db-port" className="text-sm font-medium mb-2 block">
            Port
          </Label>
          <Input
            id="db-port"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder={getPortPlaceholder()}
            type="number"
          />
        </div>
        
        <div>
          <Label htmlFor="db-name" className="text-sm font-medium mb-2 block">
            Database
          </Label>
          <Input
            id="db-name"
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            placeholder="crypto_signatures"
          />
        </div>
        
        <div className="flex items-end gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="use-tls"
              checked={useTLS}
              onCheckedChange={setUseTLS}
            />
            <Label htmlFor="use-tls" className="text-sm">
              Use TLS/HTTPS
            </Label>
          </div>
        </div>
      </div>
      
      {/* Authentication */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <Label htmlFor="db-username" className="text-sm font-medium mb-2 block">
            Username (optional)
          </Label>
          <Input
            id="db-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
          />
        </div>
        
        <div>
          <Label htmlFor="db-password" className="text-sm font-medium mb-2 block">
            Password (optional)
          </Label>
          <Input
            id="db-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
        </div>
      </div>
      
      {/* InfluxDB-specific fields */}
      {dbType === 'influxdb' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <Label htmlFor="influx-org" className="text-sm font-medium mb-2 block">
              Organization
            </Label>
            <Input
              id="influx-org"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              placeholder="default"
            />
          </div>
          
          <div>
            <Label htmlFor="influx-bucket" className="text-sm font-medium mb-2 block">
              Bucket
            </Label>
            <Input
              id="influx-bucket"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              placeholder="crypto"
            />
          </div>
          
          <div>
            <Label htmlFor="influx-token" className="text-sm font-medium mb-2 block">
              API Token
            </Label>
            <Input
              id="influx-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="API Token"
            />
          </div>
        </div>
      )}
      
      <Separator className="my-4" />
      
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={handleTestConnection}
          disabled={isConnecting}
          className="border-primary/30 hover:bg-primary/10"
        >
          {isConnecting ? (
            <ArrowsClockwise size={16} className="animate-spin" />
          ) : (
            <Plugs size={16} weight="duotone" />
          )}
          Test Connection
        </Button>
        
        <Button
          variant="outline"
          onClick={handleInitializeSchema}
          className="border-accent/30 hover:bg-accent/10"
        >
          <TableIcon size={16} weight="duotone" />
          Initialize Schema
        </Button>
        
        <Button
          onClick={handleSaveConfig}
          className="bg-primary hover:bg-primary/90"
        >
          <CloudArrowUp size={16} weight="duotone" />
          Save Configuration
        </Button>
      </div>
      
      {/* Streaming Statistics */}
      {streamingEnabled && stats && (
        <>
          <Separator className="my-4" />
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">Streaming Statistics</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetStats}
                className="h-8 px-2"
              >
                <Trash size={14} />
                Reset
              </Button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-card/50 border border-border/50">
                <div className="text-2xl font-bold text-primary">{stats.totalStreamed.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Total Streamed</div>
              </div>
              
              <div className="p-3 rounded-lg bg-card/50 border border-border/50">
                <div className="text-2xl font-bold text-success">{stats.successCount.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Successful</div>
              </div>
              
              <div className="p-3 rounded-lg bg-card/50 border border-border/50">
                <div className="text-2xl font-bold text-destructive">{stats.errorCount.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
              
              <div className="p-3 rounded-lg bg-card/50 border border-border/50">
                <div className="text-2xl font-bold text-accent">
                  {(stats.bytesWritten / 1024).toFixed(1)} KB
                </div>
                <div className="text-xs text-muted-foreground">Data Written</div>
              </div>
            </div>
            
            {stats.lastStreamedAt && (
              <div className="text-xs text-muted-foreground">
                Last streamed: {new Date(stats.lastStreamedAt).toLocaleString()}
              </div>
            )}
            
            {stats.errors.length > 0 && (
              <Alert className="border-destructive/50 bg-destructive/10">
                <Warning size={16} className="text-destructive" />
                <AlertDescription className="text-xs">
                  Last error: {stats.errors[stats.errors.length - 1]}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </>
      )}
      
      {/* Help Text */}
      <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/30">
        <div className="flex items-start gap-2">
          <Warning size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <strong>QuestDB:</strong> High-performance time-series database. 
              Run with Docker: <code className="px-1 py-0.5 bg-muted rounded">docker run -p 9000:9000 questdb/questdb</code>
            </p>
            <p>
              <strong>ClickHouse:</strong> Columnar database for analytics. 
              Recommended for petabyte-scale data.
            </p>
            <p>
              <strong>InfluxDB:</strong> Time-series platform with visualization.
              Requires API token for v2.
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default DatabaseConfigPanel
