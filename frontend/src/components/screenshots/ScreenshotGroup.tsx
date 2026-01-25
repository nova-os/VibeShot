import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { Checkbox } from '@/components/ui/checkbox'
import { ScreenshotCard } from './ScreenshotCard'
import { Screenshot } from '@/lib/api'
import { formatDateTime, cn } from '@/lib/utils'

interface ScreenshotGroupProps {
  timestamp: string
  screenshots: Screenshot[]
  compareMode: boolean
  selectedIds: Set<number>
  onSelect: (id: number) => void
  onView: (id: number) => void
  onDeleteSet: (ids: number[]) => void
  deleteMode?: boolean
  isGroupSelected?: boolean
  onSelectGroup?: () => void
}

export function ScreenshotGroup({
  timestamp,
  screenshots,
  compareMode,
  selectedIds,
  onSelect,
  onView,
  onDeleteSet,
  deleteMode = false,
  isGroupSelected = false,
  onSelectGroup,
}: ScreenshotGroupProps) {
  // Sort screenshots: desktop, tablet, mobile
  const sortOrder: Record<string, number> = { desktop: 0, tablet: 1, mobile: 2 }
  const sortedScreenshots = [...screenshots].sort(
    (a, b) => (sortOrder[a.viewport || ''] ?? 99) - (sortOrder[b.viewport || ''] ?? 99)
  )

  const ids = screenshots.map(s => s.id)

  // Calculate total errors for the group
  const { totalJsErrors, totalNetworkErrors } = useMemo(() => {
    return screenshots.reduce(
      (acc, s) => ({
        totalJsErrors: acc.totalJsErrors + Number(s.js_error_count || 0),
        totalNetworkErrors: acc.totalNetworkErrors + Number(s.network_error_count || 0),
      }),
      { totalJsErrors: 0, totalNetworkErrors: 0 }
    )
  }, [screenshots])

  const handleClick = () => {
    if (deleteMode && onSelectGroup) {
      onSelectGroup()
    }
  }

  return (
    <Card 
      className={cn(
        "overflow-hidden",
        deleteMode && "cursor-pointer",
        deleteMode && isGroupSelected && "border-primary bg-primary/5"
      )}
      onClick={handleClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-3">
          {deleteMode && (
            <Checkbox 
              checked={isGroupSelected}
              onClick={(e) => {
                e.stopPropagation()
                onSelectGroup?.()
              }}
            />
          )}
          <span className="font-medium">{formatDateTime(timestamp)}</span>
          <span className="text-sm text-muted-foreground">
            {screenshots.length} viewport{screenshots.length !== 1 ? 's' : ''}
          </span>
          
          {/* Error summary badges */}
          {(totalJsErrors > 0 || totalNetworkErrors > 0) && (
            <div className="flex items-center gap-1.5">
              {totalJsErrors > 0 && (
                <Badge variant="destructive" className="px-1.5 py-0.5 text-xs gap-1">
                  <span className="material-symbols-outlined text-xs">code_off</span>
                  {totalJsErrors}
                </Badge>
              )}
              {totalNetworkErrors > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0.5 text-xs gap-1 bg-orange-500/90 text-white border-0">
                  <span className="material-symbols-outlined text-xs">cloud_off</span>
                  {totalNetworkErrors}
                </Badge>
              )}
            </div>
          )}
        </div>
        {!deleteMode && (
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              onDeleteSet(ids)
            }}
          >
            <Icon name="delete" size="sm" />
          </Button>
        )}
      </div>

      {/* Screenshots */}
      <div 
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4"
        onClick={(e) => deleteMode && e.stopPropagation()}
      >
        {sortedScreenshots.map(screenshot => (
          <ScreenshotCard
            key={screenshot.id}
            screenshot={screenshot}
            showViewport
            compareMode={compareMode}
            isSelected={selectedIds.has(screenshot.id)}
            onSelect={onSelect}
            onClick={() => !deleteMode && onView(screenshot.id)}
          />
        ))}
      </div>
    </Card>
  )
}
