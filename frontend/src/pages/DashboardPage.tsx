import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { SiteCard, SiteCardSkeleton, EmptyState } from '@/components/sites/SiteCard'
import { AddSiteDialog } from '@/components/sites/AddSiteDialog'
import { useSites } from '@/hooks/useQueries'

export function DashboardPage() {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const { data: sites = [], isLoading } = useSites()

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
      />
    </div>
  )
}
