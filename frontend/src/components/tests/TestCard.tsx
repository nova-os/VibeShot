import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { Test, api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const VIEWPORT_ICONS: Record<string, string> = {
  desktop: 'desktop_windows',
  tablet: 'tablet',
  mobile: 'smartphone',
}

interface TestCardProps {
  test: Test
  index: number
  totalCount: number
  pageId: number
  onUpdate: () => void
  onEdit: () => void
  onDelete: () => void
  onMove: (direction: 'up' | 'down') => void
}

export function TestCard({
  test,
  index,
  totalCount,
  pageId,
  onUpdate,
  onEdit,
  onDelete,
  onMove,
}: TestCardProps) {
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isToggling, setIsToggling] = useState(false)

  const hasScript = test.script && test.script.trim().length > 0

  const getStatusBadge = () => {
    if (hasScript) {
      return <Badge variant="success">Ready</Badge>
    }
    return <Badge variant="warning">Pending</Badge>
  }

  const getViewportsBadges = () => {
    // null or empty = all viewports
    if (!test.viewports || test.viewports.length === 0) {
      return (
        <Badge variant="outline" className="text-xs gap-1">
          <span className="material-symbols-outlined text-xs">devices</span>
          All
        </Badge>
      )
    }
    
    return test.viewports.map(vp => (
      <Badge key={vp} variant="outline" className="text-xs gap-0.5 px-1.5">
        <span className="material-symbols-outlined text-xs">{VIEWPORT_ICONS[vp] || 'device_unknown'}</span>
      </Badge>
    ))
  }

  const handleToggle = async (checked: boolean) => {
    setIsToggling(true)
    try {
      await api.updateTest(pageId, test.id, { is_active: checked })
      toast.success(checked ? 'Test enabled' : 'Test disabled')
      onUpdate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update test')
    } finally {
      setIsToggling(false)
    }
  }

  const handleRegenerate = async () => {
    setIsRegenerating(true)
    try {
      await api.regenerateTest(pageId, test.id)
      toast.success('Test script regenerated successfully')
      onUpdate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to regenerate test script')
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <Card
      className={cn(
        "transition-all",
        !test.is_active && "opacity-60"
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
          <div className="font-medium truncate">{test.name}</div>
          <div className="text-sm text-muted-foreground truncate">{test.prompt}</div>
        </div>

        {/* Status & Viewports */}
        <div className="flex items-center gap-2">
          {getViewportsBadges()}
          {getStatusBadge()}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Switch
            checked={test.is_active}
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

      {/* Script Display */}
      {hasScript && (
        <details className="border-t border-border">
          <summary className="px-4 py-3 text-sm text-muted-foreground cursor-pointer hover:bg-muted/50">
            View generated test script
          </summary>
          <pre className="px-4 pb-4 text-xs font-mono text-primary/80 whitespace-pre-wrap break-words max-h-48 overflow-auto">
            {test.script}
          </pre>
        </details>
      )}
    </Card>
  )
}
