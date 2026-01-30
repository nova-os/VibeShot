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
import { Instruction } from '@/lib/api'
import { useDeleteInstruction } from '@/hooks/useQueries'
import { toast } from 'sonner'

interface DeleteInstructionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instruction: Instruction
  pageId: number
}

export function DeleteInstructionDialog({
  open,
  onOpenChange,
  instruction,
  pageId,
}: DeleteInstructionDialogProps) {
  const deleteInstruction = useDeleteInstruction()

  const handleDelete = async () => {
    deleteInstruction.mutate(
      { pageId, instructionId: instruction.id },
      {
        onSuccess: () => {
          toast.success('Instruction deleted')
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to delete instruction')
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Instruction</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{instruction.name}</strong>?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={deleteInstruction.isPending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteInstruction.isPending}>
            {deleteInstruction.isPending ? (
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
