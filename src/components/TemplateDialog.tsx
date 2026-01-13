import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AttackTemplate, AttackType } from '@/lib/types'
import { attackTemplates } from '@/lib/templates'
import { useState } from 'react'

interface TemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectTemplate: (template: AttackTemplate) => void
}

export function TemplateDialog({ open, onOpenChange, onSelectTemplate }: TemplateDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState<AttackType | 'all'>('all')

  const handleSelect = (template: AttackTemplate) => {
    onSelectTemplate(template)
    onOpenChange(false)
  }

  const filteredTemplates = selectedCategory === 'all' 
    ? attackTemplates 
    : attackTemplates.filter(t => t.type === selectedCategory)

  const categoryLabels: Record<AttackType | 'all', string> = {
    all: 'All',
    custom: 'Custom',
    rsa: 'RSA',
    'subset-sum': 'Subset Sum',
    knapsack: 'Knapsack',
    cvp: 'CVP',
    hnp: 'HNP',
    ntru: 'NTRU',
    dsa: 'DSA',
    'signature-scan': 'Sig Scan'
  }

  const getCategoryColor = (type: AttackType) => {
    const colors: Record<AttackType, string> = {
      rsa: 'bg-red-500/10 text-red-400 border-red-500/20',
      'subset-sum': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      knapsack: 'bg-green-500/10 text-green-400 border-green-500/20',
      cvp: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      hnp: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      ntru: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
      dsa: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      custom: 'bg-muted text-muted-foreground border-border',
      'signature-scan': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    }
    return colors[type]
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Attack Templates</DialogTitle>
          <DialogDescription>
            {attackTemplates.length} pre-configured attacks covering various cryptographic scenarios
          </DialogDescription>
        </DialogHeader>

        <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as AttackType | 'all')} className="space-y-4">
          <TabsList className="grid w-full grid-cols-9">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="custom" className="text-xs">Custom</TabsTrigger>
            <TabsTrigger value="rsa" className="text-xs">RSA</TabsTrigger>
            <TabsTrigger value="subset-sum" className="text-xs">Subset</TabsTrigger>
            <TabsTrigger value="knapsack" className="text-xs">Knapsack</TabsTrigger>
            <TabsTrigger value="cvp" className="text-xs">CVP</TabsTrigger>
            <TabsTrigger value="hnp" className="text-xs">HNP</TabsTrigger>
            <TabsTrigger value="ntru" className="text-xs">NTRU</TabsTrigger>
            <TabsTrigger value="dsa" className="text-xs">DSA</TabsTrigger>
          </TabsList>

          <TabsContent value={selectedCategory} className="mt-0">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-3">
                {filteredTemplates.map((template) => (
                  <div 
                    key={template.id} 
                    className="border border-border rounded-lg p-4 hover:border-accent/50 transition-colors bg-card/50"
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h3 className="font-semibold text-sm mb-1.5">{template.name}</h3>
                        <Badge variant="outline" className={`text-xs ${getCategoryColor(template.type)}`}>
                          {categoryLabels[template.type]}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                      {template.description}
                    </p>
                    <Separator className="my-3" />
                    <div className="grid grid-cols-3 gap-3 mb-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Dimension:</span>{' '}
                        <span className="font-medium">{template.basis.length}×{template.basis[0].length}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Delta:</span>{' '}
                        <span className="font-medium">{template.delta}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Vectors:</span>{' '}
                        <span className="font-medium">{template.basis.length}</span>
                      </div>
                    </div>
                    <div className="text-xs mb-3 p-2.5 bg-muted/30 rounded border border-border/50">
                      <div className="text-muted-foreground mb-1 font-medium">Expected Outcome:</div>
                      <div className="text-foreground/90">{template.expectedOutcome}</div>
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
                {filteredTemplates.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    No templates in this category
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
