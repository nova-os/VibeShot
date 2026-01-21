import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useState } from 'react'
import { api, Site } from '@/lib/api'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

interface DeleteSiteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: Site
}

export function DeleteSiteDialog({ open, onOpenChange, site }: DeleteSiteDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const handleDelete = async () => {
    setIsLoading(true)

    try {
      await api.deleteSite(site.id)
      toast.success('Site deleted successfully')
      onOpenChange(false)
      navigate('/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete site')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Site</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{site.name}</strong>?
            <br />
            <span className="text-muted-foreground">
              This will also delete all pages and screenshots.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={isLoading}>
            {isLoading ? (
              <>
                <Icon name="progress_activity" className="animate-spin" size="sm" />
                Deleting...
              </>
            ) : (
              'Delete Site'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
