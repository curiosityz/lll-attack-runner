import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Code } from '@phosphor-icons/react'

export function HexFormatTest() {
  const testBlocks = [
    1,
    10,
    100,
    1000,
    10000,
    100000,
    1000000,
    10000000,
    19000000,
    20000000,
    21000000,
    21537142
  ]

  const formatToHex = (num: number): string => {
    return '0x' + num.toString(16)
  }

  const hasLeadingZeros = (hexStr: string): boolean => {
    const afterPrefix = hexStr.slice(2)
    return afterPrefix.length > 1 && afterPrefix[0] === '0'
  }

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center gap-3 mb-4">
        <Code size={20} className="text-accent" weight="fill" />
        <div>
          <h3 className="text-sm font-semibold">Hex Format Verification</h3>
          <p className="text-xs text-muted-foreground">
            Verifying block number to hex conversion (checking for leading zeros)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        {testBlocks.map((block) => {
          const hex = formatToHex(block)
          const hasLeading = hasLeadingZeros(hex)
          
          return (
            <div
              key={block}
              className={`p-2 rounded border ${
                hasLeading
                  ? 'bg-destructive/10 border-destructive/30'
                  : 'bg-success/10 border-success/30'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono">{block.toLocaleString()}</span>
                {hasLeading ? (
                  <Badge variant="outline" className="text-[10px] bg-destructive/20 text-destructive border-destructive/50">
                    Leading 0
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-success/20 text-success border-success/50">
                    Valid
                  </Badge>
                )}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {hex}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 p-3 bg-secondary/20 rounded text-xs space-y-1">
        <div className="font-medium">Format Analysis:</div>
        <div className="text-muted-foreground">
          ✓ All test conversions produce valid hex without leading zeros after '0x'
        </div>
        <div className="text-muted-foreground">
          ✓ Block 21000000 → {formatToHex(21000000)} (no leading zeros)
        </div>
        <div className="text-muted-foreground">
          ✓ JavaScript's toString(16) naturally avoids leading zeros
        </div>
      </div>
    </Card>
  )
}
