import { useState } from 'react'
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
  const [intervalMinutes, setIntervalMinutes] = useState('360')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await api.createPage(siteId, {
        name,
        url,
        interval_minutes: parseInt(intervalMinutes, 10),
      })
      toast.success('Page added successfully')
      setName('')
      setUrl('')
      setIntervalMinutes('360')
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
              <Label htmlFor="page-name">Page Name</Label>
              <Input
                id="page-name"
                placeholder="Homepage"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
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
              <Label htmlFor="page-interval">Capture Interval (minutes)</Label>
              <Input
                id="page-interval"
                type="number"
                min="5"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(e.target.value)}
                required
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Default: 360 minutes (6 hours)
              </p>
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
