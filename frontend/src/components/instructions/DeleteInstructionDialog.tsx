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
import { api, Instruction } from '@/lib/api'
import { toast } from 'sonner'

interface DeleteInstructionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instruction: Instruction
  pageId: number
  onSuccess: () => void
}

export function DeleteInstructionDialog({
  open,
  onOpenChange,
  instruction,
  pageId,
  onSuccess,
}: DeleteInstructionDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleDelete = async () => {
    setIsLoading(true)

    try {
      await api.deleteInstruction(pageId, instruction.id)
      toast.success('Instruction deleted')
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete instruction')
    } finally {
      setIsLoading(false)
    }
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
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
