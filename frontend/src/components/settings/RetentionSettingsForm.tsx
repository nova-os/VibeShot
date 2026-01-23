import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export interface RetentionSettings {
  retention_enabled: boolean
  max_screenshots_per_page: number | null
  keep_per_day: number
  keep_per_week: number
  keep_per_month: number
  keep_per_year: number
  max_age_days: number | null
}

export interface RetentionSettingsFormProps {
  settings: RetentionSettings
  onChange: (settings: RetentionSettings) => void
  disabled?: boolean
}

export function RetentionSettingsForm({
  settings,
  onChange,
  disabled = false,
}: RetentionSettingsFormProps) {
  const handleToggle = (enabled: boolean) => {
    onChange({ ...settings, retention_enabled: enabled })
  }

  const handleNumberChange = (
    field: keyof RetentionSettings,
    value: string,
    allowNull: boolean = false
  ) => {
    if (value === '' && allowNull) {
      onChange({ ...settings, [field]: null })
      return
    }
    const num = parseInt(value, 10)
    if (!isNaN(num) && num >= 1) {
      onChange({ ...settings, [field]: num })
    }
  }

  return (
    <div className="space-y-6">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="retention-toggle">Enable Retention Policy</Label>
          <p className="text-xs text-muted-foreground">
            Automatically clean up old screenshots based on retention rules
          </p>
        </div>
        <Switch
          id="retention-toggle"
          checked={settings.retention_enabled}
          onCheckedChange={handleToggle}
          disabled={disabled}
        />
      </div>

      {settings.retention_enabled && (
        <>
          {/* Divider */}
          <div className="border-t" />

          {/* Max Screenshots Per Page */}
          <div className="space-y-3">
            <Label htmlFor="max-screenshots">Maximum Screenshots Per Page</Label>
            <div className="flex items-center gap-2">
              <Input
                id="max-screenshots"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={settings.max_screenshots_per_page ?? ''}
                onChange={(e) =>
                  handleNumberChange('max_screenshots_per_page', e.target.value, true)
                }
                className="w-32"
                disabled={disabled}
              />
              <span className="text-sm text-muted-foreground">screenshots</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Hard limit on total screenshots per page. Leave empty for unlimited.
            </p>
          </div>

          {/* GFS Retention Tiers */}
          <div className="space-y-4">
            <div>
              <Label className="text-base">Retention Tiers</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Keep a specified number of screenshots per time period (like backup rotation)
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Keep per Day */}
              <div className="space-y-2">
                <Label htmlFor="keep-per-day">Per Day (last 7 days)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="keep-per-day"
                    type="number"
                    min={1}
                    value={settings.keep_per_day}
                    onChange={(e) => handleNumberChange('keep_per_day', e.target.value)}
                    className="w-20"
                    disabled={disabled}
                  />
                  <span className="text-sm text-muted-foreground">per day</span>
                </div>
              </div>

              {/* Keep per Week */}
              <div className="space-y-2">
                <Label htmlFor="keep-per-week">Per Week (7-30 days)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="keep-per-week"
                    type="number"
                    min={1}
                    value={settings.keep_per_week}
                    onChange={(e) => handleNumberChange('keep_per_week', e.target.value)}
                    className="w-20"
                    disabled={disabled}
                  />
                  <span className="text-sm text-muted-foreground">per week</span>
                </div>
              </div>

              {/* Keep per Month */}
              <div className="space-y-2">
                <Label htmlFor="keep-per-month">Per Month (30-365 days)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="keep-per-month"
                    type="number"
                    min={1}
                    value={settings.keep_per_month}
                    onChange={(e) => handleNumberChange('keep_per_month', e.target.value)}
                    className="w-20"
                    disabled={disabled}
                  />
                  <span className="text-sm text-muted-foreground">per month</span>
                </div>
              </div>

              {/* Keep per Year */}
              <div className="space-y-2">
                <Label htmlFor="keep-per-year">Per Year (older than 365 days)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="keep-per-year"
                    type="number"
                    min={1}
                    value={settings.keep_per_year}
                    onChange={(e) => handleNumberChange('keep_per_year', e.target.value)}
                    className="w-20"
                    disabled={disabled}
                  />
                  <span className="text-sm text-muted-foreground">per year</span>
                </div>
              </div>
            </div>
          </div>

          {/* Max Age */}
          <div className="space-y-3">
            <Label htmlFor="max-age">Maximum Age</Label>
            <div className="flex items-center gap-2">
              <Input
                id="max-age"
                type="number"
                min={1}
                placeholder="No limit"
                value={settings.max_age_days ?? ''}
                onChange={(e) => handleNumberChange('max_age_days', e.target.value, true)}
                className="w-32"
                disabled={disabled}
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Delete all screenshots older than this, regardless of other retention rules. Leave
              empty for no age limit.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
