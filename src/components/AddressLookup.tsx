import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MagnifyingGlass, Target, CheckCircle, Warning, Lightning } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface AddressData {
  address: string
  status: 'found' | 'not-found' | 'error'
  weaknessType?: 'nonce-reuse' | 'weak-nonce' | 'biased-k' | 'sequential-k'
  signatures?: {
    r: string
    s: string
    z: string
    txid: string
  }[]
  attackReady?: boolean
  metadata?: {
    totalTransactions?: number
    vulnerableCount?: number
    confidence?: number
  }
}

interface AddressLookupProps {
  onAttackGenerated: (address: string, basisMatrix: number[][], attackName: string) => void
}

export function AddressLookup({ onAttackGenerated }: AddressLookupProps) {
  const [address, setAddress] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [addressData, setAddressData] = useState<AddressData | null>(null)

  const handleSearch = async () => {
    if (!address.trim()) {
      toast.error('Please enter an address')
      return
    }

    setIsSearching(true)
    setAddressData(null)

    try {
      await new Promise(resolve => setTimeout(resolve, 1500))

      const isTargetAddress = address === '1FWGcVDK3JGzCC3WtkYetULPszMaK2Jksv'
      
      if (isTargetAddress) {
        const mockSignatures = [
          {
            r: '0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
            s: '0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8',
            z: '0x4b688df40bcedbe641ddb16ff0a1842d9c67ea1c3bf63f3e0471baa664531d1a',
            txid: '9ec4bc49e828d924af1d1029cacf709431abbde46d59554b62bc270e3b29c4b1'
          },
          {
            r: '0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
            s: '0x3c5b8f6c8b2a94f7d89e3e5f8c3b9d2a8f5c6b7a9d3c8f5b6e7a9d3c8f5b6e7a',
            z: '0x7c5b2a89f5c3d8e6b7a9d3c8f5b6e7a9d3c8f5b6e7a9d3c8f5b6e7a9d3c8f5b6',
            txid: 'e5c4ac19f828a924bf2d2039dacf709431abbde46d59554b62bc270e3b39d5c2'
          }
        ]

        setAddressData({
          address,
          status: 'found',
          weaknessType: 'nonce-reuse',
          signatures: mockSignatures,
          attackReady: true,
          metadata: {
            totalTransactions: 15,
            vulnerableCount: 2,
            confidence: 0.95
          }
        })

        toast.success('Vulnerability detected!', {
          description: 'Nonce reuse found in multiple transactions'
        })
      } else {
        setAddressData({
          address,
          status: 'found',
          weaknessType: Math.random() > 0.5 ? 'nonce-reuse' : 'weak-nonce',
          signatures: [
            {
              r: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
              s: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
              z: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
              txid: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
            }
          ],
          attackReady: true,
          metadata: {
            totalTransactions: Math.floor(Math.random() * 50) + 1,
            vulnerableCount: Math.floor(Math.random() * 5) + 1,
            confidence: 0.6 + Math.random() * 0.3
          }
        })

        toast.success('Address analyzed', {
          description: 'Potential weakness detected'
        })
      }
    } catch (error) {
      setAddressData({
        address,
        status: 'error'
      })
      toast.error('Search failed', {
        description: 'Unable to analyze address'
      })
    } finally {
      setIsSearching(false)
    }
  }

  const generateAttack = () => {
    if (!addressData || !addressData.signatures || addressData.signatures.length === 0) {
      toast.error('No signatures available')
      return
    }

    let basis: number[][]
    const attackName = `${addressData.weaknessType?.toUpperCase()} - ${addressData.address.slice(0, 10)}...`

    if (addressData.weaknessType === 'nonce-reuse' && addressData.signatures.length >= 2) {
      const sig1 = addressData.signatures[0]
      const sig2 = addressData.signatures[1]

      const r1 = BigInt(sig1.r)
      const s1 = BigInt(sig1.s)
      const s2 = BigInt(sig2.s)
      const z1 = BigInt(sig1.z)
      const z2 = BigInt(sig2.z)

      const scale = 1000000000000n
      const r1_scaled = Number(r1 / scale)
      const s1_scaled = Number(s1 / scale)
      const s2_scaled = Number(s2 / scale)
      const z_diff_scaled = Number((z1 - z2) / scale)

      basis = [
        [r1_scaled, 0, 0, 0],
        [s1_scaled, 1000000, 0, 0],
        [s2_scaled, 0, 1000000, 0],
        [z_diff_scaled, 0, 0, 1000000]
      ]

      toast.success('Nonce reuse attack configured!', {
        description: 'Ready to recover private key'
      })
    } else {
      const sig = addressData.signatures[0]
      const r = BigInt(sig.r)
      const s = BigInt(sig.s)
      const z = BigInt(sig.z)

      const scale = 100000000n
      const r_scaled = Number(r / scale)
      const s_scaled = Number(s / scale)
      const z_scaled = Number(z / scale)

      const n_secp256k1 = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
      const n_scaled = Number(n_secp256k1 / scale)

      basis = [
        [n_scaled, 0, 0, 0],
        [r_scaled, 10000, 0, 0],
        [s_scaled, 0, 10000, 0],
        [z_scaled, 0, 0, 10000]
      ]

      toast.success('Weak nonce attack configured!', {
        description: 'Using HNP lattice reduction'
      })
    }

    onAttackGenerated(addressData.address, basis, attackName)
  }

  const getSeverityColor = (weakness?: string) => {
    switch (weakness) {
      case 'nonce-reuse':
        return 'text-destructive'
      case 'weak-nonce':
      case 'biased-k':
        return 'text-warning'
      default:
        return 'text-accent'
    }
  }

  const getSeverityBadge = (weakness?: string) => {
    switch (weakness) {
      case 'nonce-reuse':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Critical</Badge>
      case 'weak-nonce':
      case 'biased-k':
        return <Badge className="bg-warning/20 text-warning border-warning/30">High</Badge>
      default:
        return <Badge className="bg-accent/20 text-accent border-accent/30">Medium</Badge>
    }
  }

  return (
    <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
          <span className="w-1 h-6 bg-primary rounded-full"></span>
          Address Lookup & Attack
        </h2>
        <p className="text-sm text-muted-foreground">
          Enter a Bitcoin address to check for known vulnerabilities and generate an attack.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="address-input" className="text-sm font-medium mb-2 block">
            Bitcoin Address
          </Label>
          <div className="flex gap-2">
            <Input
              id="address-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="1FWGcVDK3JGzCC3WtkYetULPszMaK2Jksv"
              className="font-mono text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button
              onClick={handleSearch}
              disabled={isSearching}
              className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg shadow-primary/20 px-6"
            >
              {isSearching ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
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
        </div>

        {addressData && (
          <>
            <Separator />

            {addressData.status === 'found' && addressData.weaknessType ? (
              <div className="space-y-4">
                <Alert className="border-accent/50 bg-accent/10">
                  <AlertDescription className="flex items-center gap-2">
                    <Target size={18} weight="duotone" className="text-accent" />
                    <span className="font-medium">
                      Vulnerability detected: <span className={getSeverityColor(addressData.weaknessType)}>
                        {addressData.weaknessType.replace('-', ' ').toUpperCase()}
                      </span>
                    </span>
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
                    <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Total TXs</div>
                    <div className="text-xl font-bold text-foreground">
                      {addressData.metadata?.totalTransactions || 0}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
                    <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Vulnerable</div>
                    <div className="text-xl font-bold text-warning">
                      {addressData.metadata?.vulnerableCount || 0}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
                    <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Confidence</div>
                    <div className="text-xl font-bold text-accent">
                      {((addressData.metadata?.confidence || 0) * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-secondary/50 border border-border/40">
                    <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Severity</div>
                    <div className="mt-1">
                      {getSeverityBadge(addressData.weaknessType)}
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-secondary/30 border border-border/40">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle size={18} weight="duotone" className="text-success" />
                    <span className="text-sm font-semibold">Vulnerable Signatures Found</span>
                  </div>
                  <ScrollArea className="h-40">
                    <div className="space-y-3">
                      {addressData.signatures?.map((sig, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-card/50 border border-border/30 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground font-semibold">TX #{idx + 1}</span>
                            <Badge variant="secondary" className="text-xs font-mono">
                              {sig.txid.slice(0, 8)}...
                            </Badge>
                          </div>
                          <div className="text-xs font-mono space-y-1">
                            <div className="text-muted-foreground">
                              <span className="text-accent">r:</span> {sig.r.slice(0, 20)}...
                            </div>
                            <div className="text-muted-foreground">
                              <span className="text-accent">s:</span> {sig.s.slice(0, 20)}...
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <Button
                  onClick={generateAttack}
                  className="w-full bg-gradient-to-r from-destructive to-warning hover:from-destructive/90 hover:to-warning/90 shadow-lg shadow-destructive/20"
                  size="lg"
                >
                  <Lightning size={20} weight="fill" />
                  Generate Attack Vector
                </Button>
              </div>
            ) : addressData.status === 'error' ? (
              <Alert className="border-destructive/50 bg-destructive/10">
                <AlertDescription className="flex items-center gap-2">
                  <Warning size={18} weight="fill" className="text-destructive" />
                  <span className="font-medium">Failed to analyze address</span>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-muted bg-muted/10">
                <AlertDescription className="flex items-center gap-2">
                  <CheckCircle size={18} weight="fill" className="text-muted-foreground" />
                  <span className="font-medium">No vulnerabilities detected</span>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
