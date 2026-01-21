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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Icon } from '@/components/ui/icon'
import { api, Page } from '@/lib/api'
import { toast } from 'sonner'

interface EditPageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  page: Page
  onSuccess: () => void
}

export function EditPageDialog({ open, onOpenChange, page, onSuccess }: EditPageDialogProps) {
  const [name, setName] = useState(page.name)
  const [url, setUrl] = useState(page.url)
  const [intervalMinutes, setIntervalMinutes] = useState(String(page.interval_minutes))
  const [isActive, setIsActive] = useState(page.is_active)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setName(page.name)
    setUrl(page.url)
    setIntervalMinutes(String(page.interval_minutes))
    setIsActive(page.is_active)
  }, [page])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await api.updatePage(page.id, {
        name,
        url,
        interval_minutes: parseInt(intervalMinutes, 10),
        is_active: isActive,
      })
      toast.success('Page updated successfully')
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update page')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Page</DialogTitle>
          <DialogDescription>
            Update the page settings.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-page-name">Page Name</Label>
              <Input
                id="edit-page-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-page-url">URL</Label>
              <Input
                id="edit-page-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-page-interval">Capture Interval (minutes)</Label>
              <Input
                id="edit-page-interval"
                type="number"
                min="5"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-page-active" className="cursor-pointer">
                Active (capture screenshots)
              </Label>
              <Switch
                id="edit-page-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={isLoading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Icon name="progress_activity" className="animate-spin" size="sm" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
