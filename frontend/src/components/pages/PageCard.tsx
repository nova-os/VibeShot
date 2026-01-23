import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { cn, formatInterval, formatDate } from '@/lib/utils'
import type { Page, CaptureJob } from '@/lib/api'

interface PageCardProps {
  page: Page
  siteId: number
  selectMode?: boolean
  isSelected?: boolean
  onSelect?: (id: number) => void
  captureJob?: CaptureJob | null
}

export function PageCard({ page, siteId, selectMode = false, isSelected = false, onSelect, captureJob }: PageCardProps) {
  const navigate = useNavigate()

  const handleClick = () => {
    if (selectMode && onSelect) {
      onSelect(page.id)
    } else {
      navigate(`/sites/${siteId}/pages/${page.id}`)
    }
  }

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onSelect) {
      onSelect(page.id)
    }
  }

  const isCapturing = captureJob && (captureJob.status === 'pending' || captureJob.status === 'capturing')
  const captureFailed = captureJob && captureJob.status === 'failed'

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:border-primary/50 hover:bg-accent/50",
        !page.is_active && "opacity-50",
        selectMode && isSelected && "border-primary bg-primary/5",
        isCapturing && "border-blue-500/50 bg-blue-500/5"
      )}
      onClick={handleClick}
    >
      <div className="flex items-center gap-4 p-4">
        {/* Checkbox (shown in select mode) */}
        {selectMode && (
          <div onClick={handleCheckboxClick}>
            <Checkbox 
              checked={isSelected}
              className="shrink-0"
            />
          </div>
        )}

        {/* Status Indicator */}
        <div
          className={cn(
            "w-3 h-3 rounded-full shrink-0",
            isCapturing ? "bg-blue-500" : captureFailed ? "bg-destructive" : page.is_active ? "bg-green-500" : "bg-muted-foreground"
          )}
        />

        {/* Page Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{page.name}</h3>
          <p className="text-sm font-mono text-muted-foreground truncate">{page.url}</p>
        </div>

        {/* Capture Status or Meta */}
        <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground shrink-0">
          {isCapturing ? (
            <CaptureStatusBadge job={captureJob} />
          ) : captureFailed ? (
            <Badge variant="destructive" className="gap-1">
              <Icon name="error" size="xs" />
              Capture failed
            </Badge>
          ) : (
            <>
              <span>Every {formatInterval(page.interval_minutes ?? 360)}</span>
              <Badge variant="secondary">{page.screenshot_count || 0} screenshots</Badge>
              {page.latest_screenshot && (
                <span className="hidden md:inline">Last: {formatDate(page.latest_screenshot)}</span>
              )}
              {/* Error indicators for latest screenshot group */}
              {(Number(page.latest_js_error_count || 0) > 0 || Number(page.latest_network_error_count || 0) > 0) && (
                <div className="flex items-center gap-1">
                  {Number(page.latest_js_error_count || 0) > 0 && (
                    <Badge variant="destructive" className="px-1.5 py-0.5 text-xs gap-1">
                      <Icon name="code_off" size="xs" />
                      {page.latest_js_error_count}
                    </Badge>
                  )}
                  {Number(page.latest_network_error_count || 0) > 0 && (
                    <Badge variant="secondary" className="px-1.5 py-0.5 text-xs gap-1 bg-orange-500/90 text-white border-0">
                      <Icon name="cloud_off" size="xs" />
                      {page.latest_network_error_count}
                    </Badge>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

function CaptureStatusBadge({ job }: { job: CaptureJob }) {
  if (job.status === 'pending') {
    return (
      <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
        <Icon name="progress_activity" size="xs" className="animate-spin" />
        Waiting...
      </Badge>
    )
  }

  if (job.status === 'capturing') {
    const progress = job.viewports_total > 0 
      ? `${job.viewports_completed+1}/${job.viewports_total}` 
      : ''
    const viewport = job.current_viewport ? ` (${job.current_viewport})` : ''
    
    return (
      <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
        <Icon name="progress_activity" size="xs" className="animate-spin" />
        Capturing {progress}{viewport}
      </Badge>
    )
  }

  return null
}

export function PageCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <div className="flex items-center gap-4 p-4">
        <div className="w-3 h-3 rounded-full bg-muted" />
        <div className="flex-1">
          <div className="h-5 w-32 bg-muted rounded mb-2" />
          <div className="h-4 w-48 bg-muted rounded" />
        </div>
        <div className="hidden sm:flex items-center gap-4">
          <div className="h-4 w-20 bg-muted rounded" />
          <div className="h-6 w-24 bg-muted rounded" />
        </div>
      </div>
    </Card>
  )
}
