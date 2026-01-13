import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AttackTemplate } from '@/lib/types'
import { attackTemplates } from '@/lib/templates'

interface TemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectTemplate: (template: AttackTemplate) => void
}

export function TemplateDialog({ open, onOpenChange, onSelectTemplate }: TemplateDialogProps) {
  const handleSelect = (template: AttackTemplate) => {
    onSelectTemplate(template)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Attack Templates</DialogTitle>
          <DialogDescription>
            Select a pre-configured attack to get started quickly
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {attackTemplates.map((template) => (
              <div key={template.id} className="border border-border rounded-lg p-4 hover:border-accent/50 transition-colors">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="font-semibold text-sm mb-1">{template.name}</h3>
                    <Badge variant="outline" className="text-xs">
                      {template.type}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {template.description}
                </p>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Dimension:</span>{' '}
                    <span className="font-medium">{template.basis.length}×{template.basis[0].length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Delta:</span>{' '}
                    <span className="font-medium">{template.delta}</span>
                  </div>
                </div>
                <div className="text-xs mb-3 p-2 bg-muted/50 rounded">
                  <div className="text-muted-foreground mb-1">Expected Outcome:</div>
                  <div>{template.expectedOutcome}</div>
                </div>
                <Button
                  onClick={() => handleSelect(template)}
                  size="sm"
                  className="w-full"
                >
                  Load Template
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
