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
import { Site } from '@/lib/api'
import { useDeleteSite } from '@/hooks/useQueries'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

interface DeleteSiteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: Site
}

export function DeleteSiteDialog({ open, onOpenChange, site }: DeleteSiteDialogProps) {
  const navigate = useNavigate()
  const deleteSite = useDeleteSite()

  const handleDelete = async () => {
    deleteSite.mutate(site.id, {
      onSuccess: () => {
        toast.success('Site deleted successfully')
        onOpenChange(false)
        navigate('/')
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to delete site')
      },
    })
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
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={deleteSite.isPending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteSite.isPending}>
            {deleteSite.isPending ? (
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
