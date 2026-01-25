import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { ActionSequenceDisplay } from '@/components/ui/action-sequence-display'
import { Instruction, api } from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'

interface InstructionCardProps {
  instruction: Instruction
  index: number
  totalCount: number
  pageId: number
  onUpdate: () => void
  onEdit: () => void
  onDelete: () => void
  onMove: (direction: 'up' | 'down') => void
}

export function InstructionCard({
  instruction,
  index,
  totalCount,
  pageId,
  onUpdate,
  onEdit,
  onDelete,
  onMove,
}: InstructionCardProps) {
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isToggling, setIsToggling] = useState(false)

  const hasScript = instruction.script && instruction.script.trim().length > 0
  const hasError = instruction.last_error && instruction.last_error.trim().length > 0
  const hasSuccess = instruction.last_success_at

  const getStatusBadge = () => {
    if (hasError) {
      return <Badge variant="destructive">Error</Badge>
    }
    if (hasScript && hasSuccess) {
      return <Badge variant="success">Success</Badge>
    }
    if (hasScript) {
      return <Badge variant="secondary">Ready</Badge>
    }
    return <Badge variant="warning">Pending</Badge>
  }

  const handleToggle = async (checked: boolean) => {
    setIsToggling(true)
    try {
      await api.updateInstruction(pageId, instruction.id, { is_active: checked })
      toast.success(checked ? 'Instruction enabled' : 'Instruction disabled')
      onUpdate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update instruction')
    } finally {
      setIsToggling(false)
    }
  }

  const handleRegenerate = async () => {
    setIsRegenerating(true)
    try {
      await api.regenerateInstruction(pageId, instruction.id)
      toast.success('Script regenerated successfully')
      onUpdate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to regenerate script')
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <Card
      className={cn(
        "transition-all",
        !instruction.is_active && "opacity-60",
        hasError && "border-destructive"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-4 p-4">
        {/* Order Controls */}
        <div className="flex flex-col items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={index === 0}
            onClick={() => onMove('up')}
          >
            <Icon name="keyboard_arrow_up" size="sm" />
          </Button>
          <span className="text-sm font-semibold text-primary">{index + 1}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={index === totalCount - 1}
            onClick={() => onMove('down')}
          >
            <Icon name="keyboard_arrow_down" size="sm" />
          </Button>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{instruction.name}</div>
          <div className="text-sm text-muted-foreground truncate">{instruction.prompt}</div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          {instruction.script_type === 'actions' && (
            <Badge variant="outline" className="text-xs">
              <Icon name="account_tree" size="xs" className="mr-1" />
              Complex
            </Badge>
          )}
          {getStatusBadge()}
          {instruction.error_count > 0 && (
            <span className="text-xs text-destructive font-medium">
              {instruction.error_count}×
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Switch
            checked={instruction.is_active}
            onCheckedChange={handleToggle}
            disabled={isToggling}
          />
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Icon name="edit" size="sm" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRegenerate}
            disabled={isRegenerating}
          >
            <Icon
              name="refresh"
              size="sm"
              className={cn(isRegenerating && "animate-spin")}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Icon name="delete" size="sm" />
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {hasError && (
        <div className="px-4 pb-4 pt-0">
          <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30">
            <div className="text-xs font-semibold text-destructive uppercase tracking-wide mb-2">
              Last Error {instruction.last_error_at && `(${formatDateTime(instruction.last_error_at)})`}
            </div>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono max-h-32 overflow-auto">
              {instruction.last_error}
            </pre>
          </div>
        </div>
      )}

      {/* Script Display */}
      {hasScript && (
        <details className="border-t border-border">
          <summary className="px-4 py-3 text-sm text-muted-foreground cursor-pointer hover:bg-muted/50">
            View generated {instruction.script_type === 'actions' ? 'action sequence' : 'script'}
          </summary>
          <div className="px-4 pb-4">
            {instruction.script_type === 'actions' ? (
              <ActionSequenceDisplay script={instruction.script!} />
            ) : (
              <pre className="text-xs font-mono text-primary/80 whitespace-pre-wrap break-words max-h-48 overflow-auto">
                {instruction.script}
              </pre>
            )}
          </div>
        </details>
      )}
    </Card>
  )
}
