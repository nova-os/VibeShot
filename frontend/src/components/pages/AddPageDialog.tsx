import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icon } from '@/components/ui/icon'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface AddPageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: number
  onSuccess: () => void
}

export function AddPageDialog({ open, onOpenChange, siteId, onSuccess }: AddPageDialogProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isResolvingTitle, setIsResolvingTitle] = useState(false)
  const [nameWasManuallySet, setNameWasManuallySet] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setName('')
      setUrl('')
      setNameWasManuallySet(false)
      setIsResolvingTitle(false)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [open])

  // Fetch page title when URL changes (with debounce)
  useEffect(() => {
    // Don't fetch if user manually set the name
    if (nameWasManuallySet) return

    // Validate URL
    let isValidUrl = false
    try {
      const parsed = new URL(url)
      isValidUrl = parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      isValidUrl = false
    }

    if (!isValidUrl) {
      return
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const timeoutId = setTimeout(async () => {
      setIsResolvingTitle(true)
      abortControllerRef.current = new AbortController()

      try {
        const { title } = await api.fetchPageTitle(url)
        // Only update if user hasn't manually changed the name
        if (!nameWasManuallySet) {
          setName(title)
        }
      } catch {
        // Silently ignore errors - user can still enter name manually
      } finally {
        setIsResolvingTitle(false)
      }
    }, 500) // 500ms debounce

    return () => {
      clearTimeout(timeoutId)
    }
  }, [url, nameWasManuallySet])

  const handleNameChange = (value: string) => {
    setName(value)
    // Mark as manually set if user types something
    if (value.trim()) {
      setNameWasManuallySet(true)
    } else {
      setNameWasManuallySet(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await api.createPage(siteId, {
        name: name.trim() || undefined,
        url,
      })
      toast.success('Page added successfully')
      setName('')
      setUrl('')
      setNameWasManuallySet(false)
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create page')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Page</DialogTitle>
          <DialogDescription>
            Add a new page to monitor with automated screenshots.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="page-url">URL</Label>
              <Input
                id="page-url"
                type="url"
                placeholder="https://example.com/"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-name">Page Name</Label>
              <div className="relative">
                <Input
                  id="page-name"
                  placeholder={isResolvingTitle ? 'Detecting page title...' : 'Enter name or auto-detect from URL'}
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  disabled={isLoading}
                  className={isResolvingTitle ? 'pr-8' : ''}
                />
                {isResolvingTitle && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <Icon name="progress_activity" className="animate-spin text-muted-foreground" size="sm" />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Auto-detected from URL, or enter a custom name
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || isResolvingTitle}>
              {isLoading ? (
                <>
                  <Icon name="progress_activity" className="animate-spin" size="sm" />
                  Adding...
                </>
              ) : (
                'Add Page'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
