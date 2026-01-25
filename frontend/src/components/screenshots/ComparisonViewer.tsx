import { useEffect, useState, useRef, useCallback } from 'react'
import { api, Screenshot, ComparisonStats } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { cn, formatDateTime } from '@/lib/utils'

interface ComparisonViewerProps {
  beforeId: number
  afterId: number
  screenshots: Screenshot[]
  onClose: () => void
}

export function ComparisonViewer({ beforeId, afterId, screenshots, onClose }: ComparisonViewerProps) {
  const [stats, setStats] = useState<ComparisonStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const panelRefs = useRef<(HTMLDivElement | null)[]>([])
  const isSyncing = useRef(false)

  const before = screenshots.find(s => s.id === beforeId)
  const after = screenshots.find(s => s.id === afterId)

  // Sort so older is "before"
  const [actualBefore, actualAfter] = before && after
    ? new Date(before.created_at) < new Date(after.created_at)
      ? [before, after]
      : [after, before]
    : [before, after]

  useEffect(() => {
    const loadStats = async () => {
      if (!actualBefore || !actualAfter) return
      try {
        const data = await api.getComparisonStats(actualBefore.id, actualAfter.id)
        setStats(data)
      } catch (error) {
        console.error('Failed to load comparison stats:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadStats()
  }, [actualBefore, actualAfter])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Synchronized scrolling
  const handleScroll = useCallback((sourceIndex: number) => {
    if (isSyncing.current) return
    isSyncing.current = true

    const source = panelRefs.current[sourceIndex]
    if (!source) return

    const scrollTopPercent = source.scrollTop / (source.scrollHeight - source.clientHeight) || 0
    const scrollLeftPercent = source.scrollLeft / (source.scrollWidth - source.clientWidth) || 0

    panelRefs.current.forEach((panel, idx) => {
      if (panel && idx !== sourceIndex) {
        const maxScrollTop = panel.scrollHeight - panel.clientHeight
        const maxScrollLeft = panel.scrollWidth - panel.clientWidth
        panel.scrollTop = scrollTopPercent * maxScrollTop
        panel.scrollLeft = scrollLeftPercent * maxScrollLeft
      }
    })

    requestAnimationFrame(() => {
      isSyncing.current = false
    })
  }, [])

  const getChangeLevel = (percentage: number) => {
    if (percentage < 1) return { label: 'minimal', color: 'text-green-500 bg-green-500/20' }
    if (percentage < 5) return { label: 'moderate', color: 'text-yellow-500 bg-yellow-500/20' }
    return { label: 'significant', color: 'text-red-500 bg-red-500/20' }
  }

  if (!actualBefore || !actualAfter) {
    return null
  }

  const changeLevel = stats ? getChangeLevel(stats.diffPercentage) : null

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">Screenshot Comparison</h2>
          <div className="flex items-center gap-4 text-sm">
            {isLoading ? (
              <span className="text-muted-foreground italic">Analyzing changes...</span>
            ) : stats && changeLevel ? (
              <>
                <Badge className={cn("font-semibold", changeLevel.color)}>
                  {stats.diffPercentage.toFixed(1)}% changed
                </Badge>
                <span className="text-muted-foreground">
                  {stats.diffPixels.toLocaleString()} pixels differ
                </span>
              </>
            ) : (
              <span className="text-destructive">Failed to generate comparison</span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <Icon name="close" />
        </Button>
      </div>

      {/* Comparison Panels */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-px bg-border overflow-hidden">
        {/* Before Panel */}
        <div className="flex flex-col bg-background overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
            <span className="font-semibold uppercase text-sm tracking-wide">Before</span>
            <span className="text-xs text-muted-foreground font-mono">
              {formatDateTime(actualBefore.created_at)}
            </span>
          </div>
          <div
            ref={el => panelRefs.current[0] = el}
            className="flex-1 overflow-auto p-4"
            onScroll={() => handleScroll(0)}
          >
            <img
              src={api.getScreenshotImageUrl(actualBefore.id)}
              alt="Before"
              className="max-w-full rounded shadow-md"
            />
          </div>
        </div>

        {/* Diff Panel */}
        <div className="flex flex-col bg-background overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
            <span className="font-semibold uppercase text-sm tracking-wide text-pink-500">Changes</span>
            <span className="text-xs text-pink-500 italic">Magenta = changed pixels</span>
          </div>
          <div
            ref={el => panelRefs.current[1] = el}
            className="flex-1 overflow-auto p-4"
            onScroll={() => handleScroll(1)}
          >
            <img
              src={api.getComparisonImageUrl(actualBefore.id, actualAfter.id)}
              alt="Diff"
              className="max-w-full rounded shadow-md"
            />
          </div>
        </div>

        {/* After Panel */}
        <div className="flex flex-col bg-background overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
            <span className="font-semibold uppercase text-sm tracking-wide">After</span>
            <span className="text-xs text-muted-foreground font-mono">
              {formatDateTime(actualAfter.created_at)}
            </span>
          </div>
          <div
            ref={el => panelRefs.current[2] = el}
            className="flex-1 overflow-auto p-4"
            onScroll={() => handleScroll(2)}
          >
            <img
              src={api.getScreenshotImageUrl(actualAfter.id)}
              alt="After"
              className="max-w-full rounded shadow-md"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
