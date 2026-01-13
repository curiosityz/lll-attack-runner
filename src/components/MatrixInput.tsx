import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { parseBasisFromString } from '@/lib/lll'
import { useState, useEffect } from 'react'

interface MatrixInputProps {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
}

export function MatrixInput({ value, onChange, label, placeholder }: MatrixInputProps) {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (value.trim()) {
      const basis = parseBasisFromString(value)
      if (!basis) {
        setError('Invalid matrix format. Use space or comma-separated numbers, one row per line.')
      } else {
        setError(null)
      }
    } else {
      setError(null)
    }
  }, [value])

  return (
    <div className="space-y-2">
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Enter matrix (one row per line):\n1 2 3\n4 5 6\n7 8 9"}
        className={`font-mono text-sm min-h-[150px] ${error ? 'border-destructive focus-visible:ring-destructive' : 'border-input focus-visible:ring-accent'}`}
        spellCheck={false}
      />
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
