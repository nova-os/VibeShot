import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api, UserSettings } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { CaptureSettingsForm } from '@/components/settings/CaptureSettingsForm'
import { RetentionSettingsForm, RetentionSettings } from '@/components/settings/RetentionSettingsForm'
import { toast } from 'sonner'

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalSettings, setOriginalSettings] = useState<UserSettings | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setIsLoading(true)
      const data = await api.getSettings()
      setSettings(data)
      setOriginalSettings(data)
      setHasChanges(false)
    } catch (error) {
      toast.error('Failed to load settings')
      console.error('Load settings error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCaptureChange = (newSettings: { intervalMinutes: number; viewports: number[] }) => {
    if (!settings) return

    const updated: UserSettings = {
      ...settings,
      default_interval_minutes: newSettings.intervalMinutes,
      default_viewports: newSettings.viewports,
    }
    setSettings(updated)
    checkForChanges(updated)
  }

  const handleRetentionChange = (retentionSettings: RetentionSettings) => {
    if (!settings) return

    const updated: UserSettings = {
      ...settings,
      ...retentionSettings,
    }
    setSettings(updated)
    checkForChanges(updated)
  }

  const checkForChanges = (updated: UserSettings) => {
    if (!originalSettings) {
      setHasChanges(false)
      return
    }

    const changed =
      updated.default_interval_minutes !== originalSettings.default_interval_minutes ||
      JSON.stringify(updated.default_viewports) !== JSON.stringify(originalSettings.default_viewports) ||
      updated.retention_enabled !== originalSettings.retention_enabled ||
      updated.max_screenshots_per_page !== originalSettings.max_screenshots_per_page ||
      updated.keep_per_day !== originalSettings.keep_per_day ||
      updated.keep_per_week !== originalSettings.keep_per_week ||
      updated.keep_per_month !== originalSettings.keep_per_month ||
      updated.keep_per_year !== originalSettings.keep_per_year ||
      updated.max_age_days !== originalSettings.max_age_days
    setHasChanges(changed)
  }

  const handleSave = async () => {
    if (!settings) return

    try {
      setIsSaving(true)
      const updated = await api.updateSettings(settings)
      setSettings(updated)
      setOriginalSettings(updated)
      setHasChanges(false)
      toast.success('Settings saved successfully')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    if (originalSettings) {
      setSettings(originalSettings)
      setHasChanges(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <Icon name="arrow_back" size="sm" className="mr-1" />
              Back
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <Icon name="arrow_back" size="sm" className="mr-1" />
              Back
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        <Card>
          <CardContent className="py-12 text-center">
            <Icon name="error" className="mx-auto mb-4 text-destructive" size="lg" />
            <p className="text-muted-foreground">Failed to load settings</p>
            <Button onClick={loadSettings} variant="outline" className="mt-4">
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <Icon name="arrow_back" size="sm" className="mr-1" />
              Back
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        {hasChanges && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleReset} disabled={isSaving}>
              Reset
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Icon name="progress_activity" className="animate-spin mr-1" size="sm" />
                  Saving...
                </>
              ) : (
                <>
                  <Icon name="save" size="sm" className="mr-1" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Default Capture Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="settings" size="sm" />
            Default Capture Settings
          </CardTitle>
          <CardDescription>
            These settings will be used for all pages unless overridden at the page level.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CaptureSettingsForm
            intervalMinutes={settings.default_interval_minutes}
            viewports={settings.default_viewports}
            onChange={handleCaptureChange}
            disabled={isSaving}
          />
        </CardContent>
      </Card>

      {/* Screenshot Retention Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="delete_sweep" size="sm" />
            Screenshot Retention
          </CardTitle>
          <CardDescription>
            Automatically clean up old screenshots to save storage space. Uses a tiered retention
            policy similar to backup rotation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RetentionSettingsForm
            settings={{
              retention_enabled: settings.retention_enabled,
              max_screenshots_per_page: settings.max_screenshots_per_page,
              keep_per_day: settings.keep_per_day,
              keep_per_week: settings.keep_per_week,
              keep_per_month: settings.keep_per_month,
              keep_per_year: settings.keep_per_year,
              max_age_days: settings.max_age_days,
            }}
            onChange={handleRetentionChange}
            disabled={isSaving}
          />
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Icon name="info" className="text-blue-500 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">About Default Settings</p>
              <p className="text-sm text-muted-foreground">
                Pages will use these default settings unless you override them in the page settings.
                When editing a page, you can check "Use custom settings" to configure page-specific
                capture intervals and viewport widths.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
