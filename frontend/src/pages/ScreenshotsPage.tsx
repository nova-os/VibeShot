import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, Page, Screenshot, Instruction } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScreenshotCard, ScreenshotCardSkeleton } from '@/components/screenshots/ScreenshotCard'
import { ScreenshotGroup } from '@/components/screenshots/ScreenshotGroup'
import { ScreenshotViewer } from '@/components/screenshots/ScreenshotViewer'
import { ComparisonViewer } from '@/components/screenshots/ComparisonViewer'
import { EditPageDialog } from '@/components/pages/EditPageDialog'
import { DeletePageDialog } from '@/components/pages/DeletePageDialog'
import { InstructionsList } from '@/components/instructions/InstructionsList'
import { DeleteScreenshotsDialog } from '@/components/screenshots/DeleteScreenshotsDialog'
import { usePolling } from '@/hooks/usePolling'
import { toast } from 'sonner'

type ViewportFilter = 'all' | 'desktop' | 'tablet' | 'mobile'

interface ScreenshotGroupData {
  timestamp: string
  screenshots: Screenshot[]
}

export function ScreenshotsPage() {
  const { siteId, pageId } = useParams<{ siteId: string; pageId: string }>()
  const navigate = useNavigate()

  const [page, setPage] = useState<Page | null>(null)
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [instructions, setInstructions] = useState<Instruction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [viewportFilter, setViewportFilter] = useState<ViewportFilter>('all')
  const initialLoadDone = useRef(false)

  // Compare mode
  const [compareMode, setCompareMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Dialogs
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [viewerId, setViewerId] = useState<number | null>(null)
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [deleteScreenshotsIds, setDeleteScreenshotsIds] = useState<number[]>([])

  const loadData = useCallback(async () => {
    if (!pageId) return

    try {
      const [pageData, instructionsData] = await Promise.all([
        api.getPage(parseInt(pageId, 10)),
        api.getInstructions(parseInt(pageId, 10)),
      ])
      setPage(pageData)
      setInstructions(instructionsData)
    } catch (error) {
      // Only show error on initial load, not during polling
      if (!initialLoadDone.current) {
        toast.error(error instanceof Error ? error.message : 'Failed to load page')
      }
    } finally {
      setIsLoading(false)
      initialLoadDone.current = true
    }
  }, [pageId])

  const loadScreenshots = useCallback(async () => {
    if (!pageId) return

    try {
      const result = await api.getScreenshots(parseInt(pageId, 10), {
        viewport: viewportFilter === 'all' ? null : viewportFilter,
      })
      setScreenshots(result.screenshots)
    } catch (error) {
      // Silently fail during polling to avoid error spam
      if (!initialLoadDone.current) {
        toast.error(error instanceof Error ? error.message : 'Failed to load screenshots')
      }
    }
  }, [pageId, viewportFilter])

  // Combined refresh function for polling
  const refreshAll = useCallback(async () => {
    await Promise.all([loadData(), loadScreenshots()])
  }, [loadData, loadScreenshots])

  useEffect(() => {
    initialLoadDone.current = false
    setIsLoading(true)
    loadData()
  }, [pageId]) // Only reload when pageId changes

  useEffect(() => {
    if (page) {
      loadScreenshots()
    }
  }, [page, viewportFilter]) // Reload screenshots when page loads or viewport filter changes

  // Poll for updates every 30 seconds
  usePolling(refreshAll, { enabled: !!pageId && !!page })

  // Group screenshots by timestamp
  const groupedScreenshots = useMemo((): ScreenshotGroupData[] => {
    const groups: Record<string, ScreenshotGroupData> = {}

    screenshots.forEach(screenshot => {
      const date = new Date(screenshot.created_at)
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`

      if (!groups[key]) {
        groups[key] = {
          timestamp: screenshot.created_at,
          screenshots: [],
        }
      }
      groups[key].screenshots.push(screenshot)
    })

    return Object.values(groups).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [screenshots])

  const handleCaptureNow = async () => {
    if (!page) return

    try {
      await api.triggerCapture(page.id)
      toast.success('Screenshot capture scheduled')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to trigger capture')
    }
  }

  const handleSelectForCompare = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < 2) {
        next.add(id)
      } else {
        toast.error('You can only select 2 screenshots to compare')
      }
      return next
    })
  }

  const handleCompare = () => {
    if (selectedIds.size === 2) {
      setComparisonOpen(true)
    }
  }

  const handleDeleteScreenshotSet = (ids: number[]) => {
    setDeleteScreenshotsIds(ids)
  }

  const toggleCompareMode = () => {
    setCompareMode(prev => !prev)
    setSelectedIds(new Set())
  }

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center gap-4 mb-8">
          <div className="h-10 w-24 bg-muted rounded animate-pulse" />
          <div className="flex-1">
            <div className="h-8 w-48 bg-muted rounded animate-pulse mb-2" />
            <div className="h-4 w-64 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <ScreenshotCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (!page) {
    return (
      <div className="text-center py-16">
        <Icon name="error" size="xl" className="text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Page not found</h2>
        <Button variant="ghost" onClick={() => navigate(`/sites/${siteId}`)}>
          <Icon name="arrow_back" size="sm" />
          Back to Site
        </Button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4 mb-6">
        <Button variant="ghost" onClick={() => navigate(`/sites/${siteId}`)}>
          <Icon name="arrow_back" size="sm" />
          Back
        </Button>

        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold truncate">{page.name}</h1>
          <p className="text-muted-foreground font-mono text-sm truncate">{page.url}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleCaptureNow}>
            <Icon name="photo_camera" size="sm" />
            Capture Now
          </Button>
          <Button variant="secondary" onClick={() => setEditDialogOpen(true)}>
            <Icon name="edit" size="sm" />
            Edit
          </Button>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Icon name="delete" size="sm" />
            Delete
          </Button>
        </div>
      </div>

      {/* Instructions Section */}
      <InstructionsList
        pageId={page.id}
        instructions={instructions}
        onUpdate={loadData}
      />

      {/* Viewport Filter & Compare Mode */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <Tabs value={viewportFilter} onValueChange={(v) => setViewportFilter(v as ViewportFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="desktop">
              <Icon name="desktop_windows" size="sm" className="mr-1" />
              Desktop
            </TabsTrigger>
            <TabsTrigger value="tablet">
              <Icon name="tablet" size="sm" className="mr-1" />
              Tablet
            </TabsTrigger>
            <TabsTrigger value="mobile">
              <Icon name="smartphone" size="sm" className="mr-1" />
              Mobile
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2">
          <Button
            variant={compareMode ? 'default' : 'secondary'}
            onClick={toggleCompareMode}
          >
            {compareMode ? (
              <>
                <Icon name="close" size="sm" />
                Cancel
              </>
            ) : (
              <>
                <Icon name="compare" size="sm" />
                Compare
              </>
            )}
          </Button>
          {compareMode && selectedIds.size === 2 && (
            <Button onClick={handleCompare}>
              Compare Selected
            </Button>
          )}
        </div>
      </div>

      {/* Screenshots */}
      {screenshots.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <Icon name="image" size="xl" className="text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No screenshots yet</h2>
          <p className="text-muted-foreground">Screenshots will appear here once captured</p>
        </div>
      ) : viewportFilter !== 'all' ? (
        // Single viewport view - show as grid
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {screenshots.map(screenshot => (
            <ScreenshotCard
              key={screenshot.id}
              screenshot={screenshot}
              compareMode={compareMode}
              isSelected={selectedIds.has(screenshot.id)}
              onSelect={handleSelectForCompare}
              onClick={() => setViewerId(screenshot.id)}
            />
          ))}
        </div>
      ) : (
        // All viewports - group by capture time
        <div className="space-y-6">
          {groupedScreenshots.map(group => (
            <div key={group.timestamp} className="group">
              <ScreenshotGroup
                timestamp={group.timestamp}
                screenshots={group.screenshots}
                compareMode={compareMode}
                selectedIds={selectedIds}
                onSelect={handleSelectForCompare}
                onView={setViewerId}
                onDeleteSet={handleDeleteScreenshotSet}
              />
            </div>
          ))}
        </div>
      )}

      {/* Dialogs & Viewers */}
      {page && (
        <>
          <EditPageDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            page={page}
            onSuccess={loadData}
          />

          <DeletePageDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            page={page}
            siteId={parseInt(siteId!, 10)}
          />
        </>
      )}

      {viewerId && (
        <ScreenshotViewer
          screenshotId={viewerId}
          onClose={() => setViewerId(null)}
        />
      )}

      {comparisonOpen && selectedIds.size === 2 && (
        <ComparisonViewer
          beforeId={Array.from(selectedIds)[0]}
          afterId={Array.from(selectedIds)[1]}
          screenshots={screenshots}
          onClose={() => {
            setComparisonOpen(false)
            setSelectedIds(new Set())
            setCompareMode(false)
          }}
        />
      )}

      <DeleteScreenshotsDialog
        open={deleteScreenshotsIds.length > 0}
        onOpenChange={(open) => !open && setDeleteScreenshotsIds([])}
        screenshotIds={deleteScreenshotsIds}
        onSuccess={loadScreenshots}
      />
    </div>
  )
}
