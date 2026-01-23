import { useState, useEffect, useCallback } from 'react'
import { api, Site } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { SiteCard, SiteCardSkeleton, EmptyState } from '@/components/sites/SiteCard'
import { AddSiteDialog } from '@/components/sites/AddSiteDialog'
import { usePolling } from '@/hooks/usePolling'
import { toast } from 'sonner'

export function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const loadSites = useCallback(async () => {
    try {
      const data = await api.getSites()
      setSites(data)
    } catch (error) {
      // Only show error on initial load, not during polling
      if (isLoading) {
        toast.error(error instanceof Error ? error.message : 'Failed to load sites')
      }
    } finally {
      setIsLoading(false)
    }
  }, [isLoading])

  useEffect(() => {
    loadSites()
  }, []) // Only run once on mount

  // Poll for updates every 30 seconds
  usePolling(loadSites)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Monitored Sites</h1>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Icon name="add" size="sm" />
          Add Site
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <SiteCardSkeleton key={i} />
          ))}
        </div>
      ) : sites.length === 0 ? (
        <EmptyState onAddSite={() => setAddDialogOpen(true)} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </div>
      )}

      {/* Add Site Dialog */}
      <AddSiteDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={loadSites}
      />
    </div>
  )
}
