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
import { Test } from '@/lib/api'
import { useDeleteTest } from '@/hooks/useQueries'
import { toast } from 'sonner'

interface DeleteTestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  test: Test
  pageId: number
}

export function DeleteTestDialog({
  open,
  onOpenChange,
  test,
  pageId,
}: DeleteTestDialogProps) {
  const deleteTest = useDeleteTest()

  const handleDelete = async () => {
    deleteTest.mutate(
      { pageId, testId: test.id },
      {
        onSuccess: () => {
          toast.success('Test deleted')
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to delete test')
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Test</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{test.name}</strong>? This will also delete all historical test results.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={deleteTest.isPending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteTest.isPending}>
            {deleteTest.isPending ? (
              <>
                <Icon name="progress_activity" className="animate-spin" size="sm" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
