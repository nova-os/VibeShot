import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, Site, Page, CaptureJob } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { PageCard, PageCardSkeleton } from '@/components/pages/PageCard'
import { AddPageDialog } from '@/components/pages/AddPageDialog'
import { DeleteSiteDialog } from '@/components/sites/DeleteSiteDialog'
import { DeletePagesDialog } from '@/components/pages/DeletePagesDialog'
import { DiscoverPagesDialog } from '@/components/sites/DiscoverPagesDialog'
import { EditSiteDialog } from '@/components/sites/EditSiteDialog'
import { usePolling } from '@/hooks/usePolling'
import { toast } from 'sonner'

export function SiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const [site, setSite] = useState<Site | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [addPageDialogOpen, setAddPageDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [discoverDialogOpen, setDiscoverDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const initialLoadDone = useRef(false)

  // Select mode for batch delete
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [deletePagesDialogOpen, setDeletePagesDialogOpen] = useState(false)

  // Capture job tracking
  const [captureJobs, setCaptureJobs] = useState<Map<number, CaptureJob>>(new Map())
  const capturePollingRef = useRef<NodeJS.Timeout | null>(null)

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
      // Only show error on initial load, not during polling
      if (!initialLoadDone.current) {
        toast.error(error instanceof Error ? error.message : 'Failed to load site')
      }
    } finally {
      setIsLoading(false)
      initialLoadDone.current = true
    }
  }, [siteId])

  // Poll capture status for pages with active jobs
  const pollCaptureStatus = useCallback(async () => {
    const activePageIds = Array.from(captureJobs.entries())
      .filter(([, job]) => job.status === 'pending' || job.status === 'capturing')
      .map(([pageId]) => pageId)
    
    if (activePageIds.length === 0) {
      // No active jobs, stop polling
      if (capturePollingRef.current) {
        clearInterval(capturePollingRef.current)
        capturePollingRef.current = null
      }
      return
    }

    // Fetch status for all active jobs
    const statusPromises = activePageIds.map(pageId => 
      api.getCaptureStatus(pageId).then(res => ({ pageId, job: res.job }))
    )
    
    const results = await Promise.allSettled(statusPromises)
    
    setCaptureJobs(prev => {
      const next = new Map(prev)
      let hasCompletedJobs = false
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.job) {
          const { pageId, job } = result.value
          next.set(pageId, job)
          
          // Check if job just completed
          if (job.status === 'completed' || job.status === 'failed') {
            hasCompletedJobs = true
          }
        }
      }
      
      // Reload page data if any jobs completed
      if (hasCompletedJobs) {
        loadData()
      }
      
      return next
    })
  }, [captureJobs, loadData])

  // Start/stop capture status polling based on active jobs
  useEffect(() => {
    const hasActiveJobs = Array.from(captureJobs.values()).some(
      job => job.status === 'pending' || job.status === 'capturing'
    )

    if (hasActiveJobs && !capturePollingRef.current) {
      // Start polling every 2 seconds
      pollCaptureStatus()
      capturePollingRef.current = setInterval(pollCaptureStatus, 2000)
    } else if (!hasActiveJobs && capturePollingRef.current) {
      // Stop polling
      clearInterval(capturePollingRef.current)
      capturePollingRef.current = null
    }

    return () => {
      if (capturePollingRef.current) {
        clearInterval(capturePollingRef.current)
        capturePollingRef.current = null
      }
    }
  }, [captureJobs, pollCaptureStatus])

  // Load initial capture status for all pages
  useEffect(() => {
    if (pages.length === 0) return
    
    const loadCaptureStatuses = async () => {
      const statusPromises = pages.map(page => 
        api.getCaptureStatus(page.id)
          .then(res => ({ pageId: page.id, job: res.job }))
          .catch(() => ({ pageId: page.id, job: null }))
      )
      
      const results = await Promise.all(statusPromises)
      
      setCaptureJobs(prev => {
        const next = new Map(prev)
        for (const { pageId, job } of results) {
          if (job && (job.status === 'pending' || job.status === 'capturing' || job.status === 'failed')) {
            next.set(pageId, job)
          }
        }
        return next
      })
    }
    
    loadCaptureStatuses()
  }, [pages])

  useEffect(() => {
    initialLoadDone.current = false
    setIsLoading(true)
    loadData()
  }, [siteId]) // Only reload when siteId changes

  // Poll for updates every 30 seconds
  usePolling(loadData, { enabled: !!siteId })

  // Selection handlers
  const handleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(pages.map(p => p.id)))
  }

  const handleSelectNone = () => {
    setSelectedIds(new Set())
  }

  const toggleSelectMode = () => {
    setSelectMode(prev => !prev)
    setSelectedIds(new Set())
  }

  const selectedPages = pages.filter(p => selectedIds.has(p.id))

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
          <Button variant="outline" onClick={() => setDiscoverDialogOpen(true)}>
            <Icon name="auto_awesome" size="sm" />
            AI Discover
          </Button>
          <Button onClick={() => setAddPageDialogOpen(true)}>
            <Icon name="add" size="sm" />
            Add Page
          </Button>
          <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
            <Icon name="settings" size="sm" />
            Settings
          </Button>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Icon name="delete" size="sm" />
            Delete Site
          </Button>
        </div>
      </div>

      {/* Select Mode Controls */}
      {pages.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex gap-2">
            <Button
              variant={selectMode ? 'default' : 'secondary'}
              onClick={toggleSelectMode}
            >
              {selectMode ? (
                <>
                  <Icon name="close" size="sm" />
                  Cancel
                </>
              ) : (
                <>
                  <Icon name="check_box" size="sm" />
                  Select
                </>
              )}
            </Button>
            {selectMode && (
              <>
                <Button variant="outline" onClick={handleSelectAll}>
                  Select All
                </Button>
                <Button variant="outline" onClick={handleSelectNone}>
                  Select None
                </Button>
              </>
            )}
          </div>
          {selectMode && selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => setDeletePagesDialogOpen(true)}>
              <Icon name="delete" size="sm" />
              Delete {selectedIds.size} Page{selectedIds.size !== 1 ? 's' : ''}
            </Button>
          )}
        </div>
      )}

      {/* Pages List */}
      {pages.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <Icon name="web" size="xl" className="text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No pages monitored</h2>
          <p className="text-muted-foreground mb-6">
            Add pages manually or let AI discover important pages automatically
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => setDiscoverDialogOpen(true)}>
              <Icon name="auto_awesome" size="sm" />
              AI Discover Pages
            </Button>
            <Button onClick={() => setAddPageDialogOpen(true)}>
              <Icon name="add" size="sm" />
              Add Page Manually
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {pages.map((page) => (
            <PageCard
              key={page.id}
              page={page}
              siteId={site.id}
              selectMode={selectMode}
              isSelected={selectedIds.has(page.id)}
              onSelect={handleSelect}
              captureJob={captureJobs.get(page.id)}
            />
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

      <DiscoverPagesDialog
        open={discoverDialogOpen}
        onOpenChange={setDiscoverDialogOpen}
        site={site}
        onSuccess={loadData}
      />

      <EditSiteDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        site={site}
        onSuccess={(updatedSite) => {
          setSite(updatedSite)
        }}
      />

      <DeletePagesDialog
        open={deletePagesDialogOpen}
        onOpenChange={setDeletePagesDialogOpen}
        pages={selectedPages}
        onSuccess={() => {
          setSelectMode(false)
          setSelectedIds(new Set())
          loadData()
        }}
      />
    </div>
  )
}
