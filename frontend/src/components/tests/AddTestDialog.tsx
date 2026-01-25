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
import { api } from '@/lib/api'
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
  onSuccess: () => void
}

export function AddTestDialog({
  open,
  onOpenChange,
  pageId,
  onSuccess,
}: AddTestDialogProps) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [viewport, setViewport] = useState('desktop')
  const [runOnViewports, setRunOnViewports] = useState<string[]>([]) // empty = all
  const [useActions, setUseActions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const toggleViewport = (vp: string) => {
    setRunOnViewports(prev => 
      prev.includes(vp) 
        ? prev.filter(v => v !== vp)
        : [...prev, vp]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const test = await api.createTest(pageId, { 
        name, 
        prompt, 
        viewport,
        viewports: runOnViewports.length > 0 ? runOnViewports : undefined,
        useActions
      })
      
      if (test.generationError) {
        toast.error(`Test created but script generation failed: ${test.generationError}`)
      } else if (test.script) {
        const modeLabel = test.script_type === 'actions' ? 'action sequence' : 'script'
        toast.success(`Test created with AI-generated ${modeLabel}`)
      } else {
        toast.success('Test created')
      }
      
      setName('')
      setPrompt('')
      setViewport('desktop')
      setRunOnViewports([])
      setUseActions(false)
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create test')
    } finally {
      setIsLoading(false)
    }
  }

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
                disabled={isLoading}
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
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Describe the test in plain English. AI will analyze the page and generate the test script with assertions.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-viewport">Viewport for analysis</Label>
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
                      disabled={isLoading}
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
                  Generating test...
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
