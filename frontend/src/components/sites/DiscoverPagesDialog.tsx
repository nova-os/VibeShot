import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Icon } from '@/components/ui/icon'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api, DiscoveredPage, Site } from '@/lib/api'
import { toast } from 'sonner'

interface DiscoverPagesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: Site
  onSuccess: () => void
}

export function DiscoverPagesDialog({
  open,
  onOpenChange,
  site,
  onSuccess,
}: DiscoverPagesDialogProps) {
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [maxPages, setMaxPages] = useState(10)
  const [discoveredPages, setDiscoveredPages] = useState<DiscoveredPage[]>([])
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set())
  const [totalFound, setTotalFound] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setDiscoveredPages([])
      setSelectedUrls(new Set())
      setError(null)
      setTotalFound(0)
    }
  }, [open])

  const handleDiscover = async () => {
    setIsDiscovering(true)
    setError(null)
    setDiscoveredPages([])
    setSelectedUrls(new Set())

    try {
      const result = await api.discoverPages(site.id, maxPages)
      setDiscoveredPages(result.pages)
      setTotalFound(result.totalFound)
      // Select all pages by default
      setSelectedUrls(new Set(result.pages.map((p) => p.url)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover pages')
    } finally {
      setIsDiscovering(false)
    }
  }

  const handleTogglePage = (url: string) => {
    const newSelected = new Set(selectedUrls)
    if (newSelected.has(url)) {
      newSelected.delete(url)
    } else {
      newSelected.add(url)
    }
    setSelectedUrls(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedUrls.size === discoveredPages.length) {
      setSelectedUrls(new Set())
    } else {
      setSelectedUrls(new Set(discoveredPages.map((p) => p.url)))
    }
  }

  const handleAddSelected = async () => {
    if (selectedUrls.size === 0) {
      toast.error('Please select at least one page')
      return
    }

    setIsAdding(true)

    try {
      const pagesToAdd = discoveredPages
        .filter((p) => selectedUrls.has(p.url))
        .map((p) => ({
          url: p.url,
          name: p.title,
          interval_minutes: 360,
        }))

      const result = await api.bulkCreatePages(site.id, pagesToAdd)
      toast.success(`Added ${result.created} pages`)
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add pages')
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="auto_awesome" className="text-purple-500" />
            Discover Pages
          </DialogTitle>
          <DialogDescription>
            Let AI analyze <strong>{site.domain}</strong> and suggest pages to monitor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-4">
          {/* Discovery controls */}
          {discoveredPages.length === 0 && !isDiscovering && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="max-pages">Maximum pages to discover</Label>
                <Input
                  id="max-pages"
                  type="number"
                  min={1}
                  max={20}
                  value={maxPages}
                  onChange={(e) => setMaxPages(parseInt(e.target.value) || 10)}
                  className="w-32"
                />
                <p className="text-sm text-muted-foreground">
                  AI will analyze the site and suggest up to this many pages including the homepage,
                  main navigation pages, and representative content pages.
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <Icon name="error" size="sm" className="inline mr-1" />
                  {error}
                </div>
              )}

              <Button onClick={handleDiscover} className="w-full" size="lg">
                <Icon name="search" size="sm" />
                Start Discovery
              </Button>
            </div>
          )}

          {/* Loading state */}
          {isDiscovering && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Icon name="progress_activity" className="animate-spin text-purple-500" size="lg" />
              <div className="text-center">
                <p className="font-medium">Analyzing {site.domain}...</p>
                <p className="text-sm text-muted-foreground">
                  AI is exploring the site and identifying key pages
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {discoveredPages.length > 0 && !isDiscovering && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found {totalFound} links, showing {discoveredPages.length} recommended pages
                </p>
                <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                  {selectedUrls.size === discoveredPages.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              <ScrollArea className="h-[340px] rounded-md border">
                <div className="p-4 space-y-3">
                  {discoveredPages.map((page) => (
                    <div
                      key={page.url}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                        selectedUrls.has(page.url)
                          ? 'border-purple-500/50 bg-purple-500/5'
                          : 'border-border hover:border-purple-500/30'
                      }`}
                      onClick={() => handleTogglePage(page.url)}
                    >
                      <Checkbox
                        checked={selectedUrls.has(page.url)}
                        onCheckedChange={() => handleTogglePage(page.url)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{page.title}</p>
                        <p className="text-sm text-muted-foreground truncate">{page.url}</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">{page.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Button variant="outline" size="sm" onClick={handleDiscover} disabled={isDiscovering}>
                <Icon name="refresh" size="sm" />
                Re-discover
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isAdding}>
            Cancel
          </Button>
          {discoveredPages.length > 0 && (
            <Button onClick={handleAddSelected} disabled={isAdding || selectedUrls.size === 0}>
              {isAdding ? (
                <>
                  <Icon name="progress_activity" className="animate-spin" size="sm" />
                  Adding...
                </>
              ) : (
                <>
                  <Icon name="add" size="sm" />
                  Add {selectedUrls.size} Page{selectedUrls.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
