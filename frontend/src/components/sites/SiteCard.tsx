import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import type { Site } from '@/lib/api'

interface SiteCardProps {
  site: Site
}

export function SiteCard({ site }: SiteCardProps) {
  const navigate = useNavigate()

  return (
    <Card
      className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
      onClick={() => navigate(`/sites/${site.id}`)}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">{site.name}</CardTitle>
        <p className="text-sm font-mono text-muted-foreground">{site.domain}</p>
      </CardHeader>
      <CardContent>
        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{site.page_count || 0}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Pages</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{site.screenshot_count || 0}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Screenshots</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function SiteCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-2">
        <div className="h-6 w-32 bg-muted rounded" />
        <div className="h-4 w-24 bg-muted rounded mt-2" />
      </CardHeader>
      <CardContent>
        <div className="flex gap-6">
          <div className="text-center">
            <div className="h-8 w-8 bg-muted rounded mx-auto" />
            <div className="h-3 w-12 bg-muted rounded mt-1" />
          </div>
          <div className="text-center">
            <div className="h-8 w-8 bg-muted rounded mx-auto" />
            <div className="h-3 w-16 bg-muted rounded mt-1" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function EmptyState({ onAddSite }: { onAddSite: () => void }) {
  return (
    <div className="text-center py-16">
      <Icon name="photo_camera" size="xl" className="text-muted-foreground mb-4" />
      <h2 className="text-2xl font-semibold mb-2">No sites yet</h2>
      <p className="text-muted-foreground mb-6">Add your first website to start monitoring</p>
      <button
        onClick={onAddSite}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        <Icon name="add" size="sm" />
        Add Your First Site
      </button>
    </div>
  )
}
