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
import { Page } from '@/lib/api'
import { useDeletePages } from '@/hooks/useQueries'
import { toast } from 'sonner'

interface DeletePagesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pages: Page[]
  onSuccess: () => void
}

export function DeletePagesDialog({
  open,
  onOpenChange,
  pages,
  onSuccess,
}: DeletePagesDialogProps) {
  const deletePages = useDeletePages()

  const handleDelete = async () => {
    const ids = pages.map(p => p.id)
    
    deletePages.mutate(ids, {
      onSuccess: (result) => {
        toast.success(`Deleted ${result.deletedCount} page${result.deletedCount !== 1 ? 's' : ''}`)
        onOpenChange(false)
        onSuccess()
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to delete pages')
      },
    })
  }

  const count = pages.length
  const totalScreenshots = pages.reduce((sum, p) => sum + (p.screenshot_count || 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {count === 1 ? 'Page' : `${count} Pages`}</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {count === 1 ? 'this page' : `these ${count} pages`}?
            <br />
            <span className="text-muted-foreground">
              This will also delete {totalScreenshots} screenshot{totalScreenshots !== 1 ? 's' : ''} and all associated data.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={deletePages.isPending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deletePages.isPending}>
            {deletePages.isPending ? (
              <>
                <Icon name="progress_activity" className="animate-spin" size="sm" />
                Deleting...
              </>
            ) : (
              `Delete ${count !== 1 ? `${count} Pages` : 'Page'}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
