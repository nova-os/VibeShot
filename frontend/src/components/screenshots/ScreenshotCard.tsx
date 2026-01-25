import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { api, Screenshot } from '@/lib/api'
import { cn, formatDateTime, formatFileSize } from '@/lib/utils'

const VIEWPORT_ICONS: Record<string, string> = {
  mobile: 'smartphone',
  tablet: 'tablet',
  desktop: 'desktop_windows',
}

const VIEWPORT_COLORS: Record<string, string> = {
  mobile: 'bg-green-500/80',
  tablet: 'bg-yellow-500/80',
  desktop: 'bg-primary/80',
}

interface ScreenshotCardProps {
  screenshot: Screenshot
  showViewport?: boolean
  compareMode?: boolean
  isSelected?: boolean
  onSelect?: (id: number) => void
  onClick: () => void
}

export function ScreenshotCard({
  screenshot,
  showViewport = false,
  compareMode = false,
  isSelected = false,
  onSelect,
  onClick,
}: ScreenshotCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (compareMode && onSelect) {
      e.stopPropagation()
      onSelect(screenshot.id)
    } else {
      onClick()
    }
  }

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onSelect) {
      onSelect(screenshot.id)
    }
  }

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all overflow-hidden hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5",
        isSelected && "ring-2 ring-primary border-primary shadow-lg shadow-primary/20"
      )}
      onClick={handleClick}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        <img
          src={api.getScreenshotThumbnailUrl(screenshot.id)}
          alt="Screenshot thumbnail"
          className="w-full h-full object-cover object-top"
          loading="lazy"
        />

        {/* Viewport Badge */}
        {showViewport && screenshot.viewport && (
          <Badge
            className={cn(
              "absolute top-2 left-2 text-white border-0",
              VIEWPORT_COLORS[screenshot.viewport]
            )}
          >
            <span className="material-symbols-outlined text-sm mr-1">
              {VIEWPORT_ICONS[screenshot.viewport]}
            </span>
            {screenshot.viewport}
          </Badge>
        )}

        {/* Compare Checkbox */}
        {compareMode && (
          <div
            className={cn(
              "absolute top-2 right-2 p-1.5 rounded bg-black/70 backdrop-blur-sm",
              isSelected && "bg-primary"
            )}
            onClick={handleCheckboxClick}
          >
            <Checkbox
              checked={isSelected}
              className="border-white data-[state=checked]:bg-white data-[state=checked]:text-primary"
            />
          </div>
        )}

        {/* Error Indicators */}
        {!compareMode && (Number(screenshot.js_error_count || 0) > 0 || Number(screenshot.network_error_count || 0) > 0) && (
          <div className="absolute bottom-2 right-2 flex gap-1">
            {Number(screenshot.js_error_count || 0) > 0 && (
              <Badge variant="destructive" className="px-1.5 py-0.5 text-xs gap-1">
                <span className="material-symbols-outlined text-xs">code_off</span>
                {screenshot.js_error_count}
              </Badge>
            )}
            {Number(screenshot.network_error_count || 0) > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0.5 text-xs gap-1 bg-orange-500/90 text-white border-0">
                <span className="material-symbols-outlined text-xs">cloud_off</span>
                {screenshot.network_error_count}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        {!showViewport && (
          <div className="text-sm font-medium mb-1">
            {formatDateTime(screenshot.created_at)}
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {showViewport && screenshot.viewport_width && (
            <span className="font-mono text-primary mr-2">{screenshot.viewport_width}px</span>
          )}
          {screenshot.width}×{screenshot.height} · {formatFileSize(screenshot.file_size)}
        </div>
      </div>
    </Card>
  )
}

export function ScreenshotCardSkeleton() {
  return (
    <Card className="overflow-hidden animate-pulse">
      <div className="aspect-video bg-muted" />
      <div className="p-3">
        <div className="h-4 w-24 bg-muted rounded mb-2" />
        <div className="h-3 w-32 bg-muted rounded" />
      </div>
    </Card>
  )
}
