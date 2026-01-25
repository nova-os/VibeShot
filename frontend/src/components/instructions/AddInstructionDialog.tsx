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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icon } from '@/components/ui/icon'
import { AiChatPanel } from '@/components/ai/AiChatPanel'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface AddInstructionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pageId: number
  onSuccess: () => void
}

export function AddInstructionDialog({
  open,
  onOpenChange,
  pageId,
  onSuccess,
}: AddInstructionDialogProps) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [viewport, setViewport] = useState('desktop')
  const [useActions, setUseActions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [isComplete, setIsComplete] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const instruction = await api.createInstruction(pageId, { name, prompt, viewport, useActions })
      
      if (instruction.sessionId) {
        // Show the chat panel for live updates
        setSessionId(instruction.sessionId)
      } else {
        // Fallback for when no session is created (shouldn't happen normally)
        toast.success('Instruction created')
        handleClose()
        onSuccess()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create instruction')
      setIsLoading(false)
    }
  }

  const handleGenerationComplete = () => {
    setIsComplete(true)
  }

  const handleClose = () => {
    // Reset state
    setName('')
    setPrompt('')
    setViewport('desktop')
    setUseActions(false)
    setIsLoading(false)
    setSessionId(null)
    setIsComplete(false)
    onOpenChange(false)
  }

  const handleFinish = () => {
    toast.success('Instruction created with AI-generated script')
    handleClose()
    onSuccess()
  }

  // Show chat panel when generating
  if (sessionId) {
    return (
      <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Generating Script</DialogTitle>
            <DialogDescription>
              AI is analyzing the page and generating the script for "{name}"
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 min-h-[300px] overflow-hidden flex flex-col">
            <AiChatPanel 
              sessionId={sessionId} 
              onComplete={handleGenerationComplete}
              className="flex-1 min-h-0"
            />
          </div>
          
          <DialogFooter>
            {isComplete ? (
              <Button onClick={handleFinish}>
                <Icon name="check" size="sm" />
                Done
              </Button>
            ) : (
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Show form
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Instruction</DialogTitle>
          <DialogDescription>
            Create an AI-powered instruction to automate page interactions before screenshots are captured.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="instruction-name">Name</Label>
              <Input
                id="instruction-name"
                placeholder="e.g., Open mobile menu"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instruction-prompt">Instruction</Label>
              <Textarea
                id="instruction-prompt"
                placeholder="Describe what you want to do on the page, e.g., 'Click the hamburger menu icon to open the mobile navigation'"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                required
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Describe the action in plain English. AI will analyze the page and generate the script.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instruction-viewport">Viewport for analysis</Label>
              <Select value={viewport} onValueChange={setViewport} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desktop">Desktop (1920px)</SelectItem>
                  <SelectItem value="tablet">Tablet (768px)</SelectItem>
                  <SelectItem value="mobile">Mobile (375px)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The viewport size used when AI analyzes the page to generate the script.
              </p>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label htmlFor="use-actions">Complex Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Enable for multi-step workflows with page navigation, form submissions, or waiting for elements.
                </p>
              </div>
              <Switch
                id="use-actions"
                checked={useActions}
                onCheckedChange={setUseActions}
                disabled={isLoading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Icon name="progress_activity" className="animate-spin" size="sm" />
                  Starting...
                </>
              ) : (
                'Create Instruction'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
