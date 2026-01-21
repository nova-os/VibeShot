import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, Site, Page } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { PageCard, PageCardSkeleton } from '@/components/pages/PageCard'
import { AddPageDialog } from '@/components/pages/AddPageDialog'
import { DeleteSiteDialog } from '@/components/sites/DeleteSiteDialog'
import { toast } from 'sonner'

export function SiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const [site, setSite] = useState<Site | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [addPageDialogOpen, setAddPageDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const loadData = useCallback(async () => {
    if (!siteId) return

    try {
      const [siteData, pagesData] = await Promise.all([
        api.getSite(parseInt(siteId, 10)),
        api.getPages(parseInt(siteId, 10)),
      ])
      setSite(siteData)
      setPages(pagesData)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load site')
    } finally {
      setIsLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (isLoading) {
    return (
      <div>
        {/* Header Skeleton */}
        <div className="flex items-center gap-4 mb-8">
          <div className="h-10 w-24 bg-muted rounded animate-pulse" />
          <div className="flex-1">
            <div className="h-8 w-48 bg-muted rounded animate-pulse mb-2" />
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
          </div>
        </div>
        {/* Pages Skeleton */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <PageCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (!site) {
    return (
      <div className="text-center py-16">
        <Icon name="error" size="xl" className="text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Site not found</h2>
        <Button variant="ghost" onClick={() => navigate('/')}>
          <Icon name="arrow_back" size="sm" />
          Back to Dashboard
        </Button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4 mb-8">
        <Button variant="ghost" onClick={() => navigate('/')}>
          <Icon name="arrow_back" size="sm" />
          Back
        </Button>

        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold truncate">{site.name}</h1>
          <p className="text-muted-foreground font-mono">{site.domain}</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => setAddPageDialogOpen(true)}>
            <Icon name="add" size="sm" />
            Add Page
          </Button>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Icon name="delete" size="sm" />
            Delete Site
          </Button>
        </div>
      </div>

      {/* Pages List */}
      {pages.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <Icon name="web" size="xl" className="text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No pages monitored</h2>
          <p className="text-muted-foreground mb-6">Add pages to start capturing screenshots</p>
          <Button onClick={() => setAddPageDialogOpen(true)}>
            <Icon name="add" size="sm" />
            Add Page
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {pages.map((page) => (
            <PageCard key={page.id} page={page} siteId={site.id} />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <AddPageDialog
        open={addPageDialogOpen}
        onOpenChange={setAddPageDialogOpen}
        siteId={site.id}
        onSuccess={loadData}
      />

      <DeleteSiteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        site={site}
      />
    </div>
  )
}
