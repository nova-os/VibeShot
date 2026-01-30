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
import { Checkbox } from '@/components/ui/checkbox'
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
import { useCreateTest } from '@/hooks/useQueries'
import { toast } from 'sonner'

const VIEWPORT_OPTIONS = [
  { value: 'desktop', label: 'Desktop', icon: 'desktop_windows' },
  { value: 'tablet', label: 'Tablet', icon: 'tablet' },
  { value: 'mobile', label: 'Mobile', icon: 'smartphone' },
]

interface AddTestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pageId: number
}

export function AddTestDialog({
  open,
  onOpenChange,
  pageId,
}: AddTestDialogProps) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [viewport, setViewport] = useState('desktop')
  const [runOnViewports, setRunOnViewports] = useState<string[]>([]) // empty = all
  const [useActions, setUseActions] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  
  const createTest = useCreateTest()

  const toggleViewport = (vp: string) => {
    setRunOnViewports(prev => 
      prev.includes(vp) 
        ? prev.filter(v => v !== vp)
        : [...prev, vp]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    createTest.mutate(
      { 
        pageId, 
        data: { 
          name, 
          prompt, 
          viewport,
          viewports: runOnViewports.length > 0 ? runOnViewports : undefined,
          useActions
        }
      },
      {
        onSuccess: (test) => {
          if (test.sessionId) {
            // Show the chat panel for live updates
            setSessionId(test.sessionId)
          } else {
            // Fallback for when no session is created (shouldn't happen normally)
            toast.success('Test created')
            handleClose()
          }
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to create test')
        },
      }
    )
  }

  const handleGenerationComplete = () => {
    setIsComplete(true)
  }

  const handleClose = () => {
    // Reset state
    setName('')
    setPrompt('')
    setViewport('desktop')
    setRunOnViewports([])
    setUseActions(false)
    setSessionId(null)
    setIsComplete(false)
    onOpenChange(false)
  }

  const handleFinish = () => {
    toast.success('Test created with AI-generated script')
    handleClose()
  }

  // Show chat panel when generating
  if (sessionId) {
    return (
      <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Generating Test Script</DialogTitle>
            <DialogDescription>
              AI is analyzing the page and generating the test script for "{name}"
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
          <DialogTitle>Add Test</DialogTitle>
          <DialogDescription>
            Create an AI-powered test to verify page content and behavior during screenshot captures.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="test-name">Name</Label>
              <Input
                id="test-name"
                placeholder="e.g., Check hero title"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={createTest.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-prompt">Test Description</Label>
              <Textarea
                id="test-prompt"
                placeholder="Describe what you want to test, e.g., 'Check that the page title contains Welcome' or 'Verify the login button exists and is visible'"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                required
                disabled={createTest.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Describe the test in plain English. AI will analyze the page and generate the test script with assertions.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-viewport">Viewport for analysis</Label>
              <Select value={viewport} onValueChange={setViewport} disabled={createTest.isPending}>
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
                The viewport size used when AI analyzes the page to generate the test script.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Run test on viewports</Label>
              <div className="flex gap-4">
                {VIEWPORT_OPTIONS.map(vp => (
                  <label 
                    key={vp.value} 
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={runOnViewports.length === 0 || runOnViewports.includes(vp.value)}
                      onCheckedChange={() => toggleViewport(vp.value)}
                      disabled={createTest.isPending}
                    />
                    <span className="material-symbols-outlined text-sm">{vp.icon}</span>
                    <span className="text-sm">{vp.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {runOnViewports.length === 0 
                  ? 'Test will run on all viewports (default)'
                  : `Test will only run on: ${runOnViewports.join(', ')}`
                }
              </p>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label htmlFor="use-actions">Complex Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Enable for tests with page navigation, form interactions, or multi-step verification.
                </p>
              </div>
              <Switch
                id="use-actions"
                checked={useActions}
                onCheckedChange={setUseActions}
                disabled={createTest.isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={createTest.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTest.isPending}>
              {createTest.isPending ? (
                <>
                  <Icon name="progress_activity" className="animate-spin" size="sm" />
                  Starting...
                </>
              ) : (
                'Create Test'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
