import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

interface ActionStep {
  action: string
  label?: string
  selector?: string
  text?: string
  value?: string
  url?: string
  script?: string
  timeout?: number
  ms?: number
  key?: string
  waitUntil?: string
  visible?: boolean
  hidden?: boolean
  pattern?: string
  message?: string
  exact?: boolean
  contains?: boolean
  count?: number
  width?: number
  height?: number
  x?: number
  y?: number
  [key: string]: unknown
}

interface ActionSequence {
  steps: ActionStep[]
}

interface ActionSequenceDisplayProps {
  script: string
  className?: string
}

// Map action types to icons
const ACTION_ICONS: Record<string, string> = {
  click: 'mouse',
  type: 'keyboard',
  clear: 'backspace',
  select: 'arrow_drop_down_circle',
  hover: 'swipe_up',
  focus: 'center_focus_strong',
  press: 'keyboard_return',
  waitForSelector: 'hourglass_empty',
  waitForNavigation: 'sync',
  waitForTimeout: 'timer',
  waitForFunction: 'code',
  goto: 'open_in_new',
  goBack: 'arrow_back',
  goForward: 'arrow_forward',
  reload: 'refresh',
  scroll: 'expand_more',
  scrollToElement: 'vertical_align_center',
  evaluate: 'code',
  setViewport: 'aspect_ratio',
  assert: 'check_circle',
  assertSelector: 'check_circle',
  assertText: 'spellcheck',
  assertUrl: 'link',
  assertTitle: 'title',
}

// Format action parameters for display
function formatActionParams(step: ActionStep): string {
  const params: string[] = []
  
  // Primary parameter based on action type
  if (step.selector) {
    params.push(`"${step.selector}"`)
  }
  if (step.text) {
    params.push(`text: "${truncateText(step.text, 30)}"`)
  }
  if (step.value) {
    params.push(`value: "${truncateText(step.value, 30)}"`)
  }
  if (step.url) {
    params.push(`"${truncateText(step.url, 50)}"`)
  }
  if (step.pattern) {
    params.push(`pattern: "${truncateText(step.pattern, 30)}"`)
  }
  if (step.key) {
    params.push(`key: "${step.key}"`)
  }
  if (step.ms !== undefined) {
    params.push(`${step.ms}ms`)
  }
  if (step.timeout !== undefined) {
    params.push(`timeout: ${step.timeout}ms`)
  }
  if (step.waitUntil) {
    params.push(`waitUntil: "${step.waitUntil}"`)
  }
  if (step.visible !== undefined) {
    params.push(`visible: ${step.visible}`)
  }
  if (step.hidden !== undefined) {
    params.push(`hidden: ${step.hidden}`)
  }
  if (step.exact !== undefined) {
    params.push(`exact: ${step.exact}`)
  }
  if (step.count !== undefined) {
    params.push(`count: ${step.count}`)
  }
  if (step.width !== undefined && step.height !== undefined) {
    params.push(`${step.width}×${step.height}`)
  }
  if (step.x !== undefined || step.y !== undefined) {
    params.push(`x: ${step.x ?? 0}, y: ${step.y ?? 0}`)
  }
  
  return params.join(', ')
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

// Get a human-readable action name
function getActionDisplayName(action: string): string {
  const names: Record<string, string> = {
    click: 'Click',
    type: 'Type',
    clear: 'Clear',
    select: 'Select',
    hover: 'Hover',
    focus: 'Focus',
    press: 'Press Key',
    waitForSelector: 'Wait for Element',
    waitForNavigation: 'Wait for Navigation',
    waitForTimeout: 'Wait',
    waitForFunction: 'Wait for Condition',
    goto: 'Navigate to',
    goBack: 'Go Back',
    goForward: 'Go Forward',
    reload: 'Reload',
    scroll: 'Scroll',
    scrollToElement: 'Scroll to Element',
    evaluate: 'Execute Script',
    setViewport: 'Set Viewport',
    assert: 'Assert',
    assertSelector: 'Assert Element',
    assertText: 'Assert Text',
    assertUrl: 'Assert URL',
    assertTitle: 'Assert Title',
  }
  return names[action] || action
}

// Get badge variant for action type
function getActionBadgeVariant(action: string): 'default' | 'secondary' | 'outline' | 'success' {
  if (action.startsWith('assert')) return 'success'
  if (action.startsWith('wait')) return 'secondary'
  return 'outline'
}

export function ActionSequenceDisplay({ script, className }: ActionSequenceDisplayProps) {
  const [viewMode, setViewMode] = useState<'list' | 'json'>('list')
  
  const parsedSequence = useMemo(() => {
    try {
      const parsed = JSON.parse(script) as ActionSequence
      if (parsed && Array.isArray(parsed.steps)) {
        return parsed
      }
      return null
    } catch {
      return null
    }
  }, [script])
  
  // If we can't parse as JSON, just show the raw script
  if (!parsedSequence) {
    return (
      <pre className={cn("text-xs font-mono text-primary/80 whitespace-pre-wrap break-words max-h-48 overflow-auto", className)}>
        {script}
      </pre>
    )
  }
  
  return (
    <div className={className}>
      {/* View Toggle */}
      <div className="flex items-center justify-end gap-1 mb-3">
        <Button
          variant={viewMode === 'list' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setViewMode('list')}
        >
          <Icon name="list" size="xs" className="mr-1" />
          List
        </Button>
        <Button
          variant={viewMode === 'json' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setViewMode('json')}
        >
          <Icon name="data_object" size="xs" className="mr-1" />
          JSON
        </Button>
      </div>
      
      {viewMode === 'list' ? (
        <div className="space-y-2">
          {parsedSequence.steps.map((step, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-2 rounded-md bg-muted/50 hover:bg-muted/80 transition-colors"
            >
              {/* Step Number */}
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-semibold text-primary">{index + 1}</span>
              </div>
              
              {/* Action Icon */}
              <div className="flex-shrink-0 mt-0.5">
                <Icon 
                  name={ACTION_ICONS[step.action] || 'play_arrow'} 
                  size="sm" 
                  className="text-muted-foreground"
                />
              </div>
              
              {/* Action Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={getActionBadgeVariant(step.action)} className="text-xs font-mono">
                    {getActionDisplayName(step.action)}
                  </Badge>
                  {step.label && (
                    <span className="text-xs text-muted-foreground italic">
                      {step.label}
                    </span>
                  )}
                </div>
                
                {/* Parameters */}
                {formatActionParams(step) && (
                  <div className="mt-1 text-xs font-mono text-muted-foreground truncate">
                    {formatActionParams(step)}
                  </div>
                )}
                
                {/* Script preview for evaluate/assert */}
                {step.script && (
                  <div className="mt-1.5 p-1.5 rounded bg-background/50 border border-border/50">
                    <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-words max-h-16 overflow-auto">
                      {truncateText(step.script, 200)}
                    </pre>
                  </div>
                )}
                
                {/* Message for assertions */}
                {step.message && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    → {step.message}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {/* Step count summary */}
          <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border/50">
            {parsedSequence.steps.length} step{parsedSequence.steps.length !== 1 ? 's' : ''} total
            {parsedSequence.steps.filter(s => s.action.startsWith('assert')).length > 0 && (
              <span className="ml-2">
                • {parsedSequence.steps.filter(s => s.action.startsWith('assert')).length} assertion{parsedSequence.steps.filter(s => s.action.startsWith('assert')).length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      ) : (
        <pre className="text-xs font-mono text-primary/80 whitespace-pre-wrap break-words max-h-48 overflow-auto">
          {JSON.stringify(parsedSequence, null, 2)}
        </pre>
      )}
    </div>
  )
}
