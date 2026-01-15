import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Calculator, Copy, CheckCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { 
  extractSighashFromRawTx, 
  calculateSighashFromComponents,
  calculateEthereumSighash,
  calculateBitcoinSighash,
  validateSighash,
  TransactionWithSighash,
  RawTransaction
} from '@/lib/sighashCalculator'

export function SighashCalculator() {
  const [mode, setMode] = useState<'raw' | 'components' | 'bitcoin'>('raw')
  const [rawTx, setRawTx] = useState('')
  const [nonce, setNonce] = useState('')
  const [gasPrice, setGasPrice] = useState('')
  const [gasLimit, setGasLimit] = useState('')
  const [to, setTo] = useState('')
  const [value, setValue] = useState('')
  const [data, setData] = useState('')
  const [chainId, setChainId] = useState('1')
  const [result, setResult] = useState<TransactionWithSighash | null>(null)
  const [calculatedHash, setCalculatedHash] = useState<string>('')
  const [isCalculating, setIsCalculating] = useState(false)
  const [rValue, setRValue] = useState('')
  const [sValue, setSValue] = useState('')
  const [validationResult, setValidationResult] = useState<boolean | null>(null)

  const handleCalculateFromRaw = async () => {
    if (!rawTx.trim()) {
      toast.error('Please enter raw transaction data')
      return
    }

    setIsCalculating(true)
    try {
      const txResult = await extractSighashFromRawTx(rawTx)
      setResult(txResult)
      setCalculatedHash(txResult.sighash)
      
      if (rValue && sValue) {
        const isValid = validateSighash(txResult.sighash, rValue, sValue)
        setValidationResult(isValid)
      }
      
      toast.success('Sighash calculated successfully!')
    } catch (error) {
      toast.error('Failed to calculate sighash: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setIsCalculating(false)
    }
  }

  const handleCalculateFromComponents = async () => {
    if (!nonce || !gasPrice || !gasLimit || !to || !value) {
      toast.error('Please fill in all required fields')
      return
    }

    setIsCalculating(true)
    try {
      const hash = await calculateSighashFromComponents(
        parseInt(nonce),
        gasPrice,
        gasLimit,
        to,
        value,
        data || '0x',
        parseInt(chainId)
      )
      setCalculatedHash(hash)
      setResult({
        rawTx: 'N/A',
        sighash: hash,
        txType: 'ethereum'
      })
      
      if (rValue && sValue) {
        const isValid = validateSighash(hash, rValue, sValue)
        setValidationResult(isValid)
      }
      
      toast.success('Sighash calculated successfully!')
    } catch (error) {
      toast.error('Failed to calculate sighash: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setIsCalculating(false)
    }
  }

  const handleValidate = () => {
    if (!calculatedHash || !rValue || !sValue) {
      toast.error('Please provide sighash, r, and s values')
      return
    }

    const isValid = validateSighash(calculatedHash, rValue, sValue)
    setValidationResult(isValid)
    
    if (isValid) {
      toast.success('Signature values are valid!')
    } else {
      toast.error('Signature values are invalid or out of range')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard!')
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-primary/15 rounded-lg border border-primary/30">
            <Calculator size={24} className="text-primary" weight="duotone" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Sighash Calculator</h2>
            <p className="text-sm text-muted-foreground">Calculate message hash (Z) from transaction data</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Calculation Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="raw">Raw Transaction Data</SelectItem>
                <SelectItem value="components">Transaction Components</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'raw' && (
            <div>
              <Label htmlFor="raw-tx" className="text-sm font-medium mb-2 block">
                Raw Transaction (Hex)
              </Label>
              <Textarea
                id="raw-tx"
                value={rawTx}
                onChange={(e) => setRawTx(e.target.value)}
                placeholder="0xf86c... (RLP-encoded Ethereum tx) or raw Bitcoin transaction hex"
                className="font-mono text-xs h-32"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Paste the complete raw transaction data in hexadecimal format
              </p>
            </div>
          )}

          {mode === 'components' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="nonce" className="text-sm font-medium mb-2 block">
                    Nonce
                  </Label>
                  <Input
                    id="nonce"
                    type="number"
                    value={nonce}
                    onChange={(e) => setNonce(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label htmlFor="chain-id" className="text-sm font-medium mb-2 block">
                    Chain ID
                  </Label>
                  <Input
                    id="chain-id"
                    type="number"
                    value={chainId}
                    onChange={(e) => setChainId(e.target.value)}
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="gas-price" className="text-sm font-medium mb-2 block">
                    Gas Price (Wei)
                  </Label>
                  <Input
                    id="gas-price"
                    value={gasPrice}
                    onChange={(e) => setGasPrice(e.target.value)}
                    placeholder="0x0"
                  />
                </div>
                <div>
                  <Label htmlFor="gas-limit" className="text-sm font-medium mb-2 block">
                    Gas Limit
                  </Label>
                  <Input
                    id="gas-limit"
                    value={gasLimit}
                    onChange={(e) => setGasLimit(e.target.value)}
                    placeholder="0x5208"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="to" className="text-sm font-medium mb-2 block">
                  To Address
                </Label>
                <Input
                  id="to"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="0x..."
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <Label htmlFor="value" className="text-sm font-medium mb-2 block">
                  Value (Wei)
                </Label>
                <Input
                  id="value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0x0"
                />
              </div>

              <div>
                <Label htmlFor="data" className="text-sm font-medium mb-2 block">
                  Data (Optional)
                </Label>
                <Textarea
                  id="data"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  placeholder="0x"
                  className="font-mono text-xs h-20"
                />
              </div>
            </div>
          )}

          <Button
            onClick={mode === 'raw' ? handleCalculateFromRaw : handleCalculateFromComponents}
            disabled={isCalculating}
            className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
          >
            {isCalculating ? (
              <>
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                Calculating...
              </>
            ) : (
              <>
                <Calculator size={18} weight="duotone" />
                Calculate Sighash (Z)
              </>
            )}
          </Button>
        </div>
      </Card>

      <div className="space-y-6">
        {calculatedHash ? (
          <>
            <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-accent rounded-full"></span>
                Calculated Sighash (Z)
              </h3>

              <div className="space-y-4">
                <div className="p-4 bg-secondary/50 rounded-lg border border-border/40">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Message Hash</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(calculatedHash)}
                      className="h-6 px-2"
                    >
                      <Copy size={14} />
                    </Button>
                  </div>
                  <div className="font-mono text-xs break-all text-foreground">{calculatedHash}</div>
                </div>

                {result && result.txType && (
                  <div className="p-3 bg-primary/10 rounded-lg border border-primary/30">
                    <div className="text-xs text-muted-foreground mb-1">Transaction Type</div>
                    <div className="font-bold text-primary capitalize">{result.txType}</div>
                  </div>
                )}

                {result && result.r && result.s && (
                  <div className="space-y-3">
                    <div className="p-4 bg-secondary/50 rounded-lg border border-border/40">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">R Value</div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(result.r || '')}
                          className="h-6 px-2"
                        >
                          <Copy size={14} />
                        </Button>
                      </div>
                      <div className="font-mono text-xs break-all text-foreground">{result.r}</div>
                    </div>

                    <div className="p-4 bg-secondary/50 rounded-lg border border-border/40">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">S Value</div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(result.s || '')}
                          className="h-6 px-2"
                        >
                          <Copy size={14} />
                        </Button>
                      </div>
                      <div className="font-mono text-xs break-all text-foreground">{result.s}</div>
                    </div>

                    {result.v !== undefined && (
                      <div className="p-3 bg-secondary/50 rounded-lg border border-border/40">
                        <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">V Value</div>
                        <div className="font-mono text-sm text-foreground">{result.v}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
              <h3 className="text-lg font-bold mb-4">Validate Signature</h3>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="r-value" className="text-sm font-medium mb-2 block">
                    R Value
                  </Label>
                  <Input
                    id="r-value"
                    value={rValue}
                    onChange={(e) => setRValue(e.target.value)}
                    placeholder="0x..."
                    className="font-mono text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="s-value" className="text-sm font-medium mb-2 block">
                    S Value
                  </Label>
                  <Input
                    id="s-value"
                    value={sValue}
                    onChange={(e) => setSValue(e.target.value)}
                    placeholder="0x..."
                    className="font-mono text-xs"
                  />
                </div>

                <Button
                  onClick={handleValidate}
                  variant="outline"
                  className="w-full border-primary/30 hover:bg-primary/10"
                >
                  <CheckCircle size={18} weight="duotone" />
                  Validate Signature
                </Button>

                {validationResult !== null && (
                  <Alert className={validationResult ? 'border-success/50 bg-success/10' : 'border-destructive/50 bg-destructive/10'}>
                    <AlertDescription className="text-sm font-medium">
                      {validationResult
                        ? '✓ Signature values are valid and within range'
                        : '✗ Signature values are invalid or out of range'}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </Card>
          </>
        ) : (
          <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
            <div className="text-center py-16">
              <div className="inline-flex p-6 rounded-2xl bg-muted/30 mb-6">
                <Calculator size={56} className="text-muted-foreground/40" weight="duotone" />
              </div>
              <h3 className="text-lg font-bold mb-2">No Result Yet</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Enter transaction data and click "Calculate Sighash" to see the message hash
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
