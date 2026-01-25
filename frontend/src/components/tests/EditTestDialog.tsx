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
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { api, Test } from '@/lib/api'
import { toast } from 'sonner'

const VIEWPORT_OPTIONS = [
  { value: 'desktop', label: 'Desktop', icon: 'desktop_windows' },
  { value: 'tablet', label: 'Tablet', icon: 'tablet' },
  { value: 'mobile', label: 'Mobile', icon: 'smartphone' },
]

interface EditTestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  test: Test
  pageId: number
  onSuccess: () => void
}

export function EditTestDialog({
  open,
  onOpenChange,
  test,
  pageId,
  onSuccess,
}: EditTestDialogProps) {
  const [name, setName] = useState(test.name)
  const [prompt, setPrompt] = useState(test.prompt)
  const [script, setScript] = useState(test.script || '')
  const [isActive, setIsActive] = useState(test.is_active)
  const [viewports, setViewports] = useState<string[]>(test.viewports || [])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setName(test.name)
    setPrompt(test.prompt)
    setScript(test.script || '')
    setIsActive(test.is_active)
    setViewports(test.viewports || [])
  }, [test])

  const toggleViewport = (vp: string) => {
    setViewports(prev => 
      prev.includes(vp) 
        ? prev.filter(v => v !== vp)
        : [...prev, vp]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await api.updateTest(pageId, test.id, {
        name,
        prompt,
        script: script || undefined,
        is_active: isActive,
        viewports: viewports.length > 0 ? viewports : null,
      })
      toast.success('Test updated')
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update test')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Test</DialogTitle>
          <DialogDescription>
            Update the test settings and script.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-test-name">Name</Label>
              <Input
                id="edit-test-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-test-prompt">Test Description</Label>
              <Textarea
                id="edit-test-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                required
                disabled={isLoading}
              />
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
                      checked={viewports.length === 0 || viewports.includes(vp.value)}
                      onCheckedChange={() => toggleViewport(vp.value)}
                      disabled={isLoading}
                    />
                    <span className="material-symbols-outlined text-sm">{vp.icon}</span>
                    <span className="text-sm">{vp.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {viewports.length === 0 
                  ? 'Test will run on all viewports (default)'
                  : `Test will only run on: ${viewports.join(', ')}`
                }
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-test-active" className="cursor-pointer">
                Active (run during screenshot captures)
              </Label>
              <Switch
                id="edit-test-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={isLoading}
              />
            </div>
            {test.script && (
              <div className="space-y-2">
                <Label htmlFor="edit-test-script">Generated Script</Label>
                <Textarea
                  id="edit-test-script"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  You can manually edit the script if needed. Script must return {"{ passed: boolean, message: string }"}.
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
