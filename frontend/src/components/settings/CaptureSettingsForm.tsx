import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Common interval presets in minutes
const INTERVAL_PRESETS = [
  { label: '1 hour', value: 60 },
  { label: '6 hours', value: 360 },
  { label: '12 hours', value: 720 },
  { label: '1 day', value: 1440 },
  { label: '1 week', value: 10080 },
]

// Common viewport width presets
const VIEWPORT_PRESETS = [
  { label: 'Mobile', value: 375 },
  { label: 'Mobile L', value: 425 },
  { label: 'Tablet', value: 768 },
  { label: 'Laptop', value: 1024 },
  { label: 'Desktop', value: 1440 },
  { label: 'Full HD', value: 1920 },
]

export interface CaptureSettingsFormProps {
  intervalMinutes: number
  viewports: number[]
  onChange: (settings: { intervalMinutes: number; viewports: number[] }) => void
  disabled?: boolean
}

export function CaptureSettingsForm({
  intervalMinutes,
  viewports,
  onChange,
  disabled = false,
}: CaptureSettingsFormProps) {
  const [customWidth, setCustomWidth] = useState('')

  const handleIntervalChange = (value: string) => {
    const minutes = parseInt(value, 10)
    if (!isNaN(minutes) && minutes >= 5) {
      onChange({ intervalMinutes: minutes, viewports })
    }
  }

  const handleIntervalPreset = (value: string) => {
    if (value === 'custom') return
    const minutes = parseInt(value, 10)
    onChange({ intervalMinutes: minutes, viewports })
  }

  const addViewport = (width: number) => {
    if (!viewports.includes(width) && width >= 320 && width <= 3840) {
      const newViewports = [...viewports, width].sort((a, b) => b - a)
      onChange({ intervalMinutes, viewports: newViewports })
    }
  }

  const removeViewport = (width: number) => {
    if (viewports.length > 1) {
      const newViewports = viewports.filter((v) => v !== width)
      onChange({ intervalMinutes, viewports: newViewports })
    }
  }

  const handleAddCustomWidth = () => {
    const width = parseInt(customWidth, 10)
    if (!isNaN(width) && width >= 320 && width <= 3840) {
      addViewport(width)
      setCustomWidth('')
    }
  }

  const getViewportLabel = (width: number) => {
    const preset = VIEWPORT_PRESETS.find((p) => p.value === width)
    return preset ? preset.label : `${width}px`
  }

  const currentPreset = INTERVAL_PRESETS.find((p) => p.value === intervalMinutes)

  return (
    <div className="space-y-6">
      {/* Capture Interval */}
      <div className="space-y-3">
        <Label>Capture Interval</Label>
        <div className="flex gap-2">
          <Select
            value={currentPreset ? String(currentPreset.value) : 'custom'}
            onValueChange={handleIntervalPreset}
            disabled={disabled}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select preset" />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_PRESETS.map((preset) => (
                <SelectItem key={preset.value} value={String(preset.value)}>
                  {preset.label}
                </SelectItem>
              ))}
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 flex-1">
            <Input
              type="number"
              min={5}
              value={intervalMinutes}
              onChange={(e) => handleIntervalChange(e.target.value)}
              className="w-24"
              disabled={disabled}
            />
            <span className="text-sm text-muted-foreground">minutes</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          How often screenshots will be captured. Minimum 5 minutes.
        </p>
      </div>

      {/* Viewport Widths */}
      <div className="space-y-3">
        <Label>Viewport Widths</Label>
        
        {/* Current viewports */}
        <div className="flex flex-wrap gap-2">
          {viewports.map((width) => (
            <Badge
              key={width}
              variant="secondary"
              className="gap-1 pr-1"
            >
              <span>{width}px</span>
              <span className="text-muted-foreground text-xs">
                ({getViewportLabel(width)})
              </span>
              {viewports.length > 1 && !disabled && (
                <button
                  type="button"
                  onClick={() => removeViewport(width)}
                  className="ml-1 hover:bg-destructive/20 rounded p-0.5"
                >
                  <Icon name="close" size="xs" />
                </button>
              )}
            </Badge>
          ))}
        </div>

        {/* Add viewport presets */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Quick add:</p>
          <div className="flex flex-wrap gap-1">
            {VIEWPORT_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                variant={viewports.includes(preset.value) ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => {
                  if (viewports.includes(preset.value)) {
                    removeViewport(preset.value)
                  } else {
                    addViewport(preset.value)
                  }
                }}
                disabled={disabled || (viewports.includes(preset.value) && viewports.length <= 1)}
                className="h-7 text-xs"
              >
                {preset.label} ({preset.value}px)
              </Button>
            ))}
          </div>
        </div>

        {/* Custom width input */}
        <div className="flex gap-2">
          <Input
            type="number"
            min={320}
            max={3840}
            placeholder="Custom width"
            value={customWidth}
            onChange={(e) => setCustomWidth(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddCustomWidth()
              }
            }}
            className="w-32"
            disabled={disabled}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddCustomWidth}
            disabled={disabled || !customWidth}
          >
            <Icon name="add" size="sm" className="mr-1" />
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Screenshots will be captured at each viewport width. Valid range: 320-3840px.
        </p>
      </div>
    </div>
  )
}
