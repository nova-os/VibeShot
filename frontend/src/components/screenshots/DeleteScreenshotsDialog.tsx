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
import { useDeleteScreenshots } from '@/hooks/useQueries'
import { toast } from 'sonner'

interface DeleteScreenshotsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  screenshotIds: number[]
  onSuccess: () => void
}

export function DeleteScreenshotsDialog({
  open,
  onOpenChange,
  screenshotIds,
  onSuccess,
}: DeleteScreenshotsDialogProps) {
  const deleteScreenshots = useDeleteScreenshots()

  const handleDelete = async () => {
    deleteScreenshots.mutate(screenshotIds, {
      onSuccess: (result) => {
        toast.success(`Deleted ${result.deletedCount} screenshot${result.deletedCount !== 1 ? 's' : ''}`)
        onOpenChange(false)
        onSuccess()
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to delete screenshots')
      },
    })
  }

  const count = screenshotIds.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Screenshot{count !== 1 ? 's' : ''}</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {count === 1 ? 'this screenshot' : `these ${count} screenshots`}?
            <br />
            <span className="text-muted-foreground">
              This action cannot be undone.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={deleteScreenshots.isPending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteScreenshots.isPending}>
            {deleteScreenshots.isPending ? (
              <>
                <Icon name="progress_activity" className="animate-spin" size="sm" />
                Deleting...
              </>
            ) : (
              `Delete ${count !== 1 ? `${count} Screenshots` : 'Screenshot'}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
