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
import { Switch } from '@/components/ui/switch'
import { Icon } from '@/components/ui/icon'
import { CaptureSettingsForm } from '@/components/settings/CaptureSettingsForm'
import { api, Site, UserSettings } from '@/lib/api'
import { toast } from 'sonner'

interface EditSiteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: Site
  onSuccess: (updatedSite: Site) => void
}

export function EditSiteDialog({ open, onOpenChange, site, onSuccess }: EditSiteDialogProps) {
  const [name, setName] = useState(site.name)
  const [domain, setDomain] = useState(site.domain)
  const [useCustomSettings, setUseCustomSettings] = useState(false)
  const [intervalMinutes, setIntervalMinutes] = useState(1440)
  const [viewports, setViewports] = useState<number[]>([1920, 768, 375])
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)

  // Load user settings and initialize form when dialog opens
  useEffect(() => {
    if (open) {
      setName(site.name)
      setDomain(site.domain)
      
      // Check if site has custom settings
      const hasCustomSettings = site.interval_minutes !== null || site.viewports !== null
      setUseCustomSettings(hasCustomSettings)
      
      // Load user settings to show as reference/defaults
      loadUserSettings()
    }
  }, [open, site])

  const loadUserSettings = async () => {
    setIsLoadingSettings(true)
    try {
      const settings = await api.getSettings()
      setUserSettings(settings)
      
      // Initialize with site's custom values or user defaults
      if (site.interval_minutes !== null) {
        setIntervalMinutes(site.interval_minutes)
      } else {
        setIntervalMinutes(settings.default_interval_minutes)
      }
      
      if (site.viewports !== null) {
        setViewports(site.viewports)
      } else {
        setViewports(settings.default_viewports)
      }
    } catch (error) {
      console.error('Failed to load user settings:', error)
      // Use system defaults if we can't load user settings
      setIntervalMinutes(site.interval_minutes ?? 1440)
      setViewports(site.viewports ?? [1920, 768, 375])
    } finally {
      setIsLoadingSettings(false)
    }
  }

  const handleCaptureSettingsChange = (settings: { intervalMinutes: number; viewports: number[] }) => {
    setIntervalMinutes(settings.intervalMinutes)
    setViewports(settings.viewports)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const updatedSite = await api.updateSite(site.id, {
        name,
        domain,
        // Set to null if not using custom settings (inherit from user defaults)
        interval_minutes: useCustomSettings ? intervalMinutes : null,
        viewports: useCustomSettings ? viewports : null,
      })
      
      toast.success('Site updated successfully')
      onSuccess(updatedSite)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update site')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Site</DialogTitle>
          <DialogDescription>
            Update site details and capture settings.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="site-name">Site Name</Label>
                <Input
                  id="site-name"
                  placeholder="My Website"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-domain">Domain</Label>
                <Input
                  id="site-domain"
                  placeholder="example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t" />

            {/* Custom Capture Settings Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="custom-settings-toggle">Use Custom Capture Settings</Label>
                <p className="text-xs text-muted-foreground">
                  Override your account defaults for pages in this site
                </p>
              </div>
              <Switch
                id="custom-settings-toggle"
                checked={useCustomSettings}
                onCheckedChange={setUseCustomSettings}
                disabled={isLoading || isLoadingSettings}
              />
            </div>

            {/* Capture Settings */}
            {useCustomSettings && (
              <>
                {isLoadingSettings ? (
                  <div className="flex items-center justify-center py-8">
                    <Icon name="progress_activity" className="animate-spin" />
                  </div>
                ) : (
                  <CaptureSettingsForm
                    intervalMinutes={intervalMinutes}
                    viewports={viewports}
                    onChange={handleCaptureSettingsChange}
                    disabled={isLoading}
                  />
                )}
              </>
            )}

            {/* Info about inheritance */}
            {!useCustomSettings && userSettings && (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                <div className="flex gap-3">
                  <Icon name="info" className="text-blue-500 shrink-0" size="sm" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">Using Account Defaults</p>
                    <p className="text-muted-foreground">
                      Pages in this site will use your account defaults:
                    </p>
                    <ul className="text-muted-foreground list-disc list-inside">
                      <li>Interval: {formatInterval(userSettings.default_interval_minutes)}</li>
                      <li>Viewports: {userSettings.default_viewports.join(', ')}px</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || isLoadingSettings}>
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

// Helper to format interval for display
function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`
  if (minutes < 1440) return `${minutes / 60} hours`
  if (minutes === 1440) return '1 day'
  if (minutes < 10080) return `${minutes / 1440} days`
  return `${minutes / 10080} weeks`
}
