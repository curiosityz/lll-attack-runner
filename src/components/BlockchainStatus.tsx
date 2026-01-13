import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CircleNotch, CheckCircle, XCircle, Lightning } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'

interface BlockchainStatusProps {
  rpcUrl: string
}

type ConnectionStatus = 'connecting' | 'connected' | 'error' | 'disconnected'

export function BlockchainStatus({ rpcUrl }: BlockchainStatusProps) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [latestBlock, setLatestBlock] = useState<number | null>(null)
  const [blockTime, setBlockTime] = useState<number | null>(null)
  const [chainId, setChainId] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [blocksSinceUpdate, setBlocksSinceUpdate] = useState(0)

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null
    let isActive = true

    const fetchBlockchainData = async () => {
      if (!isActive) return

      try {
        setStatus('connecting')

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }

        if (rpcUrl.includes('infura.io') || rpcUrl.includes('alchemy.com') || rpcUrl.includes('quicknode.pro')) {
          headers['Accept'] = 'application/json'
        }

        const [blockResponse, chainResponse] = await Promise.all([
          fetch(rpcUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_blockNumber',
              params: [],
              id: 1,
            }),
            signal: AbortSignal.timeout(10000)
          }),
          fetch(rpcUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_chainId',
              params: [],
              id: 2,
            }),
            signal: AbortSignal.timeout(10000)
          }),
        ])

        if (!blockResponse.ok || !chainResponse.ok) {
          throw new Error('RPC request failed')
        }

        const [blockData, chainData] = await Promise.all([
          blockResponse.json(),
          chainResponse.json(),
        ])

        if (blockData.error || chainData.error) {
          throw new Error(blockData.error?.message || chainData.error?.message || 'RPC error')
        }

        const newBlockNumber = parseInt(blockData.result, 16)

        if (latestBlock !== null && newBlockNumber > latestBlock) {
          setBlocksSinceUpdate((prev) => prev + (newBlockNumber - latestBlock))
        }

        setLatestBlock(newBlockNumber)
        setChainId(chainData.result)
        setStatus('connected')
        setLastUpdate(new Date())

        if (latestBlock !== null && newBlockNumber !== latestBlock) {
          const timeDiff = (Date.now() - lastUpdate.getTime()) / 1000
          setBlockTime(Math.round(timeDiff))
        }
      } catch (error) {
        if (isActive) {
          setStatus('error')
          console.error('Blockchain status fetch error:', error)
        }
      }
    }

    fetchBlockchainData()

    pollInterval = setInterval(fetchBlockchainData, 12000)

    return () => {
      isActive = false
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [rpcUrl, latestBlock, lastUpdate])

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'text-success'
      case 'connecting':
        return 'text-accent'
      case 'error':
        return 'text-destructive'
      default:
        return 'text-muted-foreground'
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return <CheckCircle size={16} weight="fill" className="text-success" />
      case 'connecting':
        return <CircleNotch size={16} className="text-accent animate-spin" />
      case 'error':
        return <XCircle size={16} weight="fill" className="text-destructive" />
      default:
        return <XCircle size={16} weight="fill" className="text-muted-foreground" />
    }
  }

  const getChainName = (id: string | null) => {
    if (!id) return 'Unknown'
    const chainIdNum = parseInt(id, 16)
    switch (chainIdNum) {
      case 1:
        return 'Ethereum Mainnet'
      case 5:
        return 'Goerli'
      case 11155111:
        return 'Sepolia'
      case 137:
        return 'Polygon'
      case 56:
        return 'BSC'
      case 42161:
        return 'Arbitrum One'
      case 10:
        return 'Optimism'
      case 8453:
        return 'Base'
      default:
        return `Chain ${chainIdNum}`
    }
  }

  const formatTimestamp = (date: Date) => {
    const now = new Date()
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffSeconds < 60) return `${diffSeconds}s ago`
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
    return date.toLocaleTimeString()
  }

  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className={`text-xs font-semibold ${getStatusColor()}`}>
              {status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Error'}
            </span>
          </div>

          <div className="h-4 w-px bg-border" />

          {status === 'connected' && latestBlock !== null ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Latest Block</span>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={latestBlock}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2"
                  >
                    <span className="text-base font-bold font-mono text-foreground">
                      {latestBlock.toLocaleString()}
                    </span>
                    {blocksSinceUpdate > 0 && (
                      <Badge variant="outline" className="text-xs h-5 px-1.5 bg-success/10 text-success border-success/20">
                        <Lightning size={10} weight="fill" className="mr-0.5" />
                        +{blocksSinceUpdate}
                      </Badge>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {chainId && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Network</span>
                    <span className="text-sm font-semibold text-foreground">
                      {getChainName(chainId)}
                    </span>
                  </div>
                </>
              )}

              {blockTime !== null && blockTime > 0 && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Block Time</span>
                    <span className="text-sm font-semibold text-foreground">~{blockTime}s</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {status === 'error' ? 'Unable to connect to RPC' : 'Fetching blockchain data...'}
            </span>
          )}
        </div>

        <div className="text-xs text-muted-foreground whitespace-nowrap">
          Updated {formatTimestamp(lastUpdate)}
        </div>
      </div>
    </Card>
  )
}
