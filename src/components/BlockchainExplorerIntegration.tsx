import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  MagnifyingGlass, 
  CheckCircle, 
  Warning, 
  CurrencyBtc, 
  CurrencyEth,
  Lightning,
  Database,
  Clock,
  Hash
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { blockchainExplorer, ExplorerTransaction } from '@/lib/blockchain-explorer'

interface BlockchainExplorerIntegrationProps {
  onTransactionsFetched?: (transactions: ExplorerTransaction[]) => void
  onSignaturesExtracted?: (signatures: Array<{
    r: string
    s: string
    z: string
    txid: string
    blockNumber: number
    timestamp: number
  }>) => void
}

export function BlockchainExplorerIntegration({ 
  onTransactionsFetched,
  onSignaturesExtracted 
}: BlockchainExplorerIntegrationProps) {
  const [address, setAddress] = useState('')
  const [chain, setChain] = useState<'bitcoin' | 'ethereum' | 'bitcoin-testnet'>('bitcoin')
  const [isSearching, setIsSearching] = useState(false)
  const [addressData, setAddressData] = useState<{
    address: string
    balance: string
    totalTransactions: number
    transactions: ExplorerTransaction[]
    signatures: Array<{
      r: string
      s: string
      z: string
      txid: string
      blockNumber: number
      timestamp: number
    }>
  } | null>(null)

  const EXAMPLE_ADDRESSES = {
    bitcoin: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    'bitcoin-testnet': 'mkHS9ne12qx9pS9VojpwU5xtRd4T7X7ZUt',
    ethereum: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
  }

  const handleExampleAddress = () => {
    setAddress(EXAMPLE_ADDRESSES[chain])
  }

  const handleSearch = async () => {
    if (!address.trim()) {
      toast.error('Please enter an address')
      return
    }

    setIsSearching(true)
    setAddressData(null)

    try {
      toast.info('Fetching data from blockchain explorers...', {
        description: 'This may take a few moments'
      })

      const info = await blockchainExplorer.fetchAddressInfo(address, chain)
      
      const sigData = await blockchainExplorer.analyzeAddressSignatures(address, chain)

      setAddressData({
        address: info.address,
        balance: info.balance,
        totalTransactions: info.totalTransactions,
        transactions: info.transactions,
        signatures: sigData.signatures
      })

      if (onTransactionsFetched) {
        onTransactionsFetched(info.transactions)
      }

      if (onSignaturesExtracted && sigData.signatures.length > 0) {
        onSignaturesExtracted(sigData.signatures)
      }

      toast.success(`Found ${info.transactions.length} transactions`, {
        description: `Extracted ${sigData.signatures.length} signatures for analysis`
      })
    } catch (error) {
      console.error('Search error:', error)
      toast.error('Failed to fetch data', {
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      })
      setAddressData(null)
    } finally {
      setIsSearching(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const truncateHash = (hash: string, start = 10, end = 8) => {
    if (hash.length <= start + end) return hash
    return `${hash.slice(0, start)}...${hash.slice(-end)}`
  }

  return (
    <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
          <span className="w-1 h-6 bg-accent rounded-full"></span>
          Blockchain Explorer
        </h2>
        <p className="text-sm text-muted-foreground">
          Fetch real transaction data from blockchain explorers
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="blockchain-select" className="text-sm font-medium mb-2 block">
            Blockchain
          </Label>
          <Select value={chain} onValueChange={(v) => setChain(v as any)}>
            <SelectTrigger id="blockchain-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bitcoin">
                <div className="flex items-center gap-2">
                  <CurrencyBtc size={16} weight="duotone" />
                  Bitcoin Mainnet
                </div>
              </SelectItem>
              <SelectItem value="bitcoin-testnet">
                <div className="flex items-center gap-2">
                  <CurrencyBtc size={16} weight="duotone" />
                  Bitcoin Testnet
                </div>
              </SelectItem>
              <SelectItem value="ethereum">
                <div className="flex items-center gap-2">
                  <CurrencyEth size={16} weight="duotone" />
                  Ethereum Mainnet
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="explorer-address" className="text-sm font-medium mb-2 block">
            Address
          </Label>
          <div className="flex gap-2">
            <Input
              id="explorer-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter blockchain address..."
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="font-mono text-sm"
            />
            <Button
              onClick={handleSearch}
              disabled={isSearching || !address.trim()}
              className="bg-gradient-to-r from-accent to-primary hover:from-accent/90 hover:to-primary/90"
            >
              {isSearching ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-accent-foreground border-t-transparent rounded-full" />
                  Searching...
                </>
              ) : (
                <>
                  <MagnifyingGlass size={18} weight="duotone" />
                  Search
                </>
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-muted-foreground">
              Fetches from Blockchair, Blockchain.com, and BlockCypher APIs
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExampleAddress}
              className="text-xs h-7 text-accent hover:text-accent hover:bg-accent/10"
            >
              Use Example
            </Button>
          </div>
        </div>

        {addressData && (
          <>
            <Separator />

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-lg bg-secondary/30 border border-border/40">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">
                    <Database size={14} />
                    Transactions
                  </div>
                  <div className="text-xl font-bold text-foreground">
                    {addressData.totalTransactions}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-secondary/30 border border-border/40">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">
                    <Lightning size={14} />
                    Signatures
                  </div>
                  <div className="text-xl font-bold text-accent">
                    {addressData.signatures.length}
                  </div>
                </div>
              </div>

              {addressData.signatures.length > 0 ? (
                <Alert className="border-success/50 bg-success/10">
                  <CheckCircle size={18} weight="duotone" className="text-success" />
                  <AlertDescription className="text-sm font-medium ml-2">
                    Successfully extracted {addressData.signatures.length} signatures from transactions
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-warning/50 bg-warning/10">
                  <Warning size={18} weight="duotone" className="text-warning" />
                  <AlertDescription className="text-sm font-medium ml-2">
                    No signatures found in transactions. Try a different address or blockchain.
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold">Recent Transactions</h3>
                  <Badge variant="secondary" className="text-xs">
                    {addressData.transactions.length} found
                  </Badge>
                </div>
                
                <ScrollArea className="h-[300px] rounded-lg border border-border/40 bg-secondary/20">
                  <div className="p-3 space-y-2">
                    {addressData.transactions.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No transactions found
                      </div>
                    ) : (
                      addressData.transactions.map((tx, idx) => (
                        <div
                          key={tx.hash + idx}
                          className="p-3 rounded-lg bg-card/50 border border-border/30 hover:border-border/60 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <Hash size={14} className="text-muted-foreground flex-shrink-0" />
                              <code className="text-xs font-mono text-foreground truncate">
                                {truncateHash(tx.hash)}
                              </code>
                            </div>
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              Block {tx.blockNumber}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock size={12} />
                            {formatDate(tx.timestamp)}
                          </div>
                          
                          {addressData.signatures.some(sig => sig.txid === tx.hash) && (
                            <Badge className="mt-2 text-xs bg-accent/20 text-accent border-accent/30">
                              <Lightning size={12} weight="fill" className="mr-1" />
                              Signature Extracted
                            </Badge>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>

              {addressData.signatures.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold">Extracted Signatures</h3>
                    <Badge variant="secondary" className="text-xs bg-accent/20 text-accent border-accent/30">
                      {addressData.signatures.length} signatures
                    </Badge>
                  </div>
                  
                  <ScrollArea className="h-[250px] rounded-lg border border-border/40 bg-secondary/20">
                    <div className="p-3 space-y-2">
                      {addressData.signatures.map((sig, idx) => (
                        <div
                          key={sig.txid + idx}
                          className="p-3 rounded-lg bg-card/50 border border-accent/20 hover:border-accent/40 transition-colors"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground font-medium">TX:</span>
                              <code className="text-xs font-mono text-foreground">
                                {truncateHash(sig.txid)}
                              </code>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground font-medium">R:</span>
                              <code className="text-xs font-mono text-foreground truncate">
                                {truncateHash(sig.r, 16, 6)}
                              </code>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground font-medium">S:</span>
                              <code className="text-xs font-mono text-foreground truncate">
                                {truncateHash(sig.s, 16, 6)}
                              </code>
                            </div>
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/20">
                              <div className="text-xs text-muted-foreground">
                                Block {sig.blockNumber}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatDate(sig.timestamp)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
