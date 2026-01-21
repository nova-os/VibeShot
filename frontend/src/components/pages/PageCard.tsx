import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, formatInterval, formatDate } from '@/lib/utils'
import type { Page } from '@/lib/api'

interface PageCardProps {
  page: Page
  siteId: number
}

export function PageCard({ page, siteId }: PageCardProps) {
  const navigate = useNavigate()

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:border-primary/50 hover:bg-accent/50",
        !page.is_active && "opacity-50"
      )}
      onClick={() => navigate(`/sites/${siteId}/pages/${page.id}`)}
    >
      <div className="flex items-center gap-4 p-4">
        {/* Status Indicator */}
        <div
          className={cn(
            "w-3 h-3 rounded-full shrink-0",
            page.is_active ? "bg-green-500" : "bg-muted-foreground"
          )}
        />

        {/* Page Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{page.name}</h3>
          <p className="text-sm font-mono text-muted-foreground truncate">{page.url}</p>
        </div>

        {/* Meta */}
        <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground shrink-0">
          <span>Every {formatInterval(page.interval_minutes)}</span>
          <Badge variant="secondary">{page.screenshot_count || 0} screenshots</Badge>
          {page.latest_screenshot && (
            <span className="hidden md:inline">Last: {formatDate(page.latest_screenshot)}</span>
          )}
        </div>
      </div>
    </Card>
  )
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
