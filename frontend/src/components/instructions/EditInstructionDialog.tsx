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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Icon } from '@/components/ui/icon'
import { Instruction } from '@/lib/api'
import { useUpdateInstruction } from '@/hooks/useQueries'
import { toast } from 'sonner'

interface EditInstructionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instruction: Instruction
  pageId: number
}

export function EditInstructionDialog({
  open,
  onOpenChange,
  instruction,
  pageId,
}: EditInstructionDialogProps) {
  const [name, setName] = useState(instruction.name)
  const [prompt, setPrompt] = useState(instruction.prompt)
  const [script, setScript] = useState(instruction.script || '')
  const [isActive, setIsActive] = useState(instruction.is_active)
  
  const updateInstruction = useUpdateInstruction()

  useEffect(() => {
    setName(instruction.name)
    setPrompt(instruction.prompt)
    setScript(instruction.script || '')
    setIsActive(instruction.is_active)
  }, [instruction])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    updateInstruction.mutate(
      {
        pageId,
        instructionId: instruction.id,
        data: {
          name,
          prompt,
          script: script || undefined,
          is_active: isActive,
        },
      },
      {
        onSuccess: () => {
          toast.success('Instruction updated')
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to update instruction')
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Instruction</DialogTitle>
          <DialogDescription>
            Update the instruction settings and script.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-instruction-name">Name</Label>
              <Input
                id="edit-instruction-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={updateInstruction.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-instruction-prompt">Instruction</Label>
              <Textarea
                id="edit-instruction-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                required
                disabled={updateInstruction.isPending}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-instruction-active" className="cursor-pointer">
                Active (execute before screenshots)
              </Label>
              <Switch
                id="edit-instruction-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={updateInstruction.isPending}
              />
            </div>
            {instruction.script && (
              <div className="space-y-2">
                <Label htmlFor="edit-instruction-script">Generated Script</Label>
                <Textarea
                  id="edit-instruction-script"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                  disabled={updateInstruction.isPending}
                />
                <p className="text-xs text-muted-foreground">
                  You can manually edit the script if needed.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={updateInstruction.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateInstruction.isPending}>
              {updateInstruction.isPending ? (
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
