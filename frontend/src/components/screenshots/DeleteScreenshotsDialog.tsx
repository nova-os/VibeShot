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
import { Icon } from '@/components/ui/icon'
import { api } from '@/lib/api'
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
  const [isLoading, setIsLoading] = useState(false)

  const handleDelete = async () => {
    setIsLoading(true)

    try {
      const result = await api.deleteScreenshotSet(screenshotIds)
      toast.success(`Deleted ${result.deletedCount} screenshot${result.deletedCount !== 1 ? 's' : ''}`)
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete screenshots')
    } finally {
      setIsLoading(false)
    }
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
              `Delete ${count !== 1 ? `${count} Screenshots` : 'Screenshot'}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
