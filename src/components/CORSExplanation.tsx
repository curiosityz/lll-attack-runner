import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Info, LockKey, FileText, CheckCircle } from '@phosphor-icons/react'

export function CORSExplanation() {
  return (
    <Card className="p-6 bg-card/80 backdrop-blur-sm border-destructive/30 shadow-lg">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-destructive/10 rounded-lg">
          <LockKey size={24} className="text-destructive" weight="duotone" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
            Browser Security Blocks Direct API Access
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Modern browsers enforce <strong>CORS (Cross-Origin Resource Sharing)</strong> policies that prevent 
            web applications from directly accessing blockchain APIs and explorers. This is a security feature, not a bug.
          </p>
          
          <div className="space-y-3">
            <Alert className="border-accent/50 bg-accent/10">
              <Info size={16} className="text-accent" weight="duotone" />
              <AlertDescription className="text-xs">
                <strong>What This Means:</strong> The app cannot fetch data from blockchain.info, blockchair.com, 
                or most RPC endpoints directly from your browser.
              </AlertDescription>
            </Alert>

            <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
              <div className="flex items-start gap-3 mb-3">
                <CheckCircle size={18} className="text-success mt-0.5" weight="fill" />
                <div>
                  <h4 className="text-sm font-bold text-success mb-1">Recommended Solution</h4>
                  <p className="text-xs text-muted-foreground">
                    Use the <strong>file upload feature</strong> instead - it works perfectly and is actually faster:
                  </p>
                </div>
              </div>
              
              <ol className="space-y-2 ml-7 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-foreground">1.</span>
                  <span>Export transaction/signature data from a blockchain explorer as JSON or CSV</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-foreground">2.</span>
                  <span>Upload the file using the "Data Upload" section below</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-foreground">3.</span>
                  <span>The app will parse signatures and run the full analysis instantly</span>
                </li>
              </ol>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg border border-border/40">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={14} className="text-muted-foreground" weight="duotone" />
                <span className="text-xs font-semibold text-muted-foreground">Supported File Formats</span>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• <strong>JSON:</strong> Signatures with r, s, z values</div>
                <div>• <strong>CSV:</strong> Comma-separated signature data</div>
                <div>• <strong>Text:</strong> Raw transaction dumps</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
