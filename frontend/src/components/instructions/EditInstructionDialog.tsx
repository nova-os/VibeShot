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
import { api, Instruction } from '@/lib/api'
import { toast } from 'sonner'

interface EditInstructionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instruction: Instruction
  pageId: number
  onSuccess: () => void
}

export function EditInstructionDialog({
  open,
  onOpenChange,
  instruction,
  pageId,
  onSuccess,
}: EditInstructionDialogProps) {
  const [name, setName] = useState(instruction.name)
  const [prompt, setPrompt] = useState(instruction.prompt)
  const [script, setScript] = useState(instruction.script || '')
  const [isActive, setIsActive] = useState(instruction.is_active)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setName(instruction.name)
    setPrompt(instruction.prompt)
    setScript(instruction.script || '')
    setIsActive(instruction.is_active)
  }, [instruction])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await api.updateInstruction(pageId, instruction.id, {
        name,
        prompt,
        script: script || undefined,
        is_active: isActive,
      })
      toast.success('Instruction updated')
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update instruction')
    } finally {
      setIsLoading(false)
    }
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
                disabled={isLoading}
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
                disabled={isLoading}
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
                disabled={isLoading}
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
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  You can manually edit the script if needed.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
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
