import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Page } from '@/lib/api'
import { CaptureSettingsForm } from '@/components/settings/CaptureSettingsForm'
import { useSettings, useUpdatePage } from '@/hooks/useQueries'
import { toast } from 'sonner'
import { DEFAULT_INTERVAL_MINUTES, DEFAULT_VIEWPORTS } from '@/lib/constants'

interface EditPageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  page: Page
}

export function EditPageDialog({ open, onOpenChange, page }: EditPageDialogProps) {
  const [name, setName] = useState(page.name)
  const [url, setUrl] = useState(page.url)
  const [isActive, setIsActive] = useState(page.is_active)
  
  // Custom settings state
  const [useCustomSettings, setUseCustomSettings] = useState(false)
  const [intervalMinutes, setIntervalMinutes] = useState(DEFAULT_INTERVAL_MINUTES)
  const [viewports, setViewports] = useState<number[]>(DEFAULT_VIEWPORTS)
  
  // User settings for defaults display
  const { data: userSettings, isLoading: loadingSettings } = useSettings()
  const updatePage = useUpdatePage()

  // Initialize form state when page changes
  useEffect(() => {
    setName(page.name)
    setUrl(page.url)
    setIsActive(page.is_active)
    
    // Check if page has custom settings
    const hasCustomInterval = page.interval_minutes !== null
    const hasCustomViewports = page.viewports !== null && page.viewports.length > 0
    const hasCustom = hasCustomInterval || hasCustomViewports
    
    setUseCustomSettings(hasCustom)
    
    if (hasCustom) {
      setIntervalMinutes(page.interval_minutes ?? DEFAULT_INTERVAL_MINUTES)
      setViewports(page.viewports ?? DEFAULT_VIEWPORTS)
    } else {
      // Will be set from user settings
      setIntervalMinutes(DEFAULT_INTERVAL_MINUTES)
      setViewports(DEFAULT_VIEWPORTS)
    }
  }, [page])

  // Update defaults from user settings
  useEffect(() => {
    if (userSettings && !useCustomSettings) {
      setIntervalMinutes(userSettings.default_interval_minutes)
      setViewports(userSettings.default_viewports)
    }
    
    // If page doesn't have custom settings, use the loaded defaults
    if (userSettings && page.interval_minutes === null && page.viewports === null) {
      setIntervalMinutes(userSettings.default_interval_minutes)
      setViewports(userSettings.default_viewports)
    }
  }, [userSettings, useCustomSettings, page])

  const handleSettingsChange = (settings: { intervalMinutes: number; viewports: number[] }) => {
    setIntervalMinutes(settings.intervalMinutes)
    setViewports(settings.viewports)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    updatePage.mutate(
      {
        id: page.id,
        data: {
          name,
          url,
          is_active: isActive,
          // If using custom settings, send the values; otherwise send null to use defaults
          interval_minutes: useCustomSettings ? intervalMinutes : null,
          viewports: useCustomSettings ? viewports : null,
        },
      },
      {
        onSuccess: () => {
          toast.success('Page updated successfully')
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to update page')
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Page</DialogTitle>
          <DialogDescription>
            Update the page settings.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Basic Settings */}
            <div className="space-y-2">
              <Label htmlFor="edit-page-name">Page Name</Label>
              <Input
                id="edit-page-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={updatePage.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-page-url">URL</Label>
              <Input
                id="edit-page-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={updatePage.isPending}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-page-active" className="cursor-pointer">
                Active (capture screenshots)
              </Label>
              <Switch
                id="edit-page-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={updatePage.isPending}
              />
            </div>

            <Separator className="my-4" />

            {/* Capture Settings Section */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="use-custom-settings"
                  checked={useCustomSettings}
                  onCheckedChange={(checked) => setUseCustomSettings(checked === true)}
                  disabled={updatePage.isPending}
                />
                <Label htmlFor="use-custom-settings" className="cursor-pointer font-medium">
                  Use custom capture settings
                </Label>
              </div>

              {useCustomSettings ? (
                <div className="pl-6 border-l-2 border-primary/20">
                  <CaptureSettingsForm
                    intervalMinutes={intervalMinutes}
                    viewports={viewports}
                    onChange={handleSettingsChange}
                    disabled={updatePage.isPending}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <Icon name="info" className="text-muted-foreground shrink-0 mt-0.5" size="sm" />
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Using default settings from your account.
                      </p>
                      {loadingSettings ? (
                        <p className="text-xs text-muted-foreground">Loading defaults...</p>
                      ) : userSettings ? (
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>
                            <span className="font-medium">Interval:</span>{' '}
                            {userSettings.default_interval_minutes >= 60 
                              ? `${Math.floor(userSettings.default_interval_minutes / 60)}h ${userSettings.default_interval_minutes % 60 > 0 ? `${userSettings.default_interval_minutes % 60}m` : ''}`
                              : `${userSettings.default_interval_minutes}m`}
                          </p>
                          <p>
                            <span className="font-medium">Viewports:</span>{' '}
                            {userSettings.default_viewports.join('px, ')}px
                          </p>
                        </div>
                      ) : null}
                      <Link
                        to="/settings"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        onClick={() => onOpenChange(false)}
                      >
                        <Icon name="settings" size="xs" />
                        Edit default settings
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={updatePage.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={updatePage.isPending}>
              {updatePage.isPending ? (
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
