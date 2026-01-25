import { useState, useEffect, useRef } from 'react'
import { api, AiMessage, AiMessagesResponse } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/ui/icon'
import { Badge } from '@/components/ui/badge'

interface AiChatPanelProps {
  sessionId: number
  /** If true, load all messages once instead of polling (for viewing history) */
  historyMode?: boolean
  onComplete?: () => void
  className?: string
}

// Message component for different roles
function ChatMessage({ message }: { message: AiMessage }) {
  const [expanded, setExpanded] = useState(false)
  
  // Parse content if it's JSON
  const parseContent = (content: string) => {
    try {
      return JSON.parse(content)
    } catch {
      return content
    }
  }
  
  const parsed = parseContent(message.content)
  
  // Truncate long content for preview
  const getPreview = (content: string | object) => {
    if (typeof content === 'object') {
      const str = JSON.stringify(content)
      return str.length > 100 ? str.slice(0, 100) + '...' : str
    }
    return content.length > 100 ? content.slice(0, 100) + '...' : content
  }
  
  const needsExpand = (content: string | object) => {
    if (typeof content === 'object') {
      return JSON.stringify(content).length > 100
    }
    return content.length > 100
  }
  
  switch (message.role) {
    case 'system':
      return (
        <div className="mb-3">
          <div 
            className="bg-violet-500/10 border border-violet-500/30 rounded-lg px-4 py-2 cursor-pointer hover:bg-violet-500/15 transition-colors"
            onClick={() => needsExpand(message.content) && setExpanded(!expanded)}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon name="psychology" size="sm" className="text-violet-600 dark:text-violet-400" />
              <span className="text-sm font-medium text-violet-600 dark:text-violet-400">System Prompt</span>
              {needsExpand(message.content) && (
                <Icon 
                  name={expanded ? 'expand_less' : 'expand_more'} 
                  size="sm" 
                  className="text-muted-foreground ml-auto" 
                />
              )}
            </div>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-x-auto">
              {expanded ? message.content : getPreview(message.content)}
            </pre>
          </div>
        </div>
      )
    
    case 'user':
      return (
        <div className="flex justify-end mb-3">
          <div className="bg-primary text-primary-foreground rounded-lg px-4 py-2 max-w-[85%]">
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      )
    
    case 'tool_call':
      // Format parameters inline like function arguments
      const formatParams = (params: unknown) => {
        if (!params || typeof params !== 'object') return ''
        const entries = Object.entries(params as Record<string, unknown>)
        if (entries.length === 0) return ''
        return entries.map(([key, value]) => {
          const strValue = typeof value === 'string' 
            ? `"${value.length > 50 ? value.slice(0, 50) + '...' : value}"`
            : JSON.stringify(value)
          return `${key}: ${strValue}`
        }).join(', ')
      }
      const paramsStr = formatParams(parsed)
      const hasLongParams = paramsStr.length > 80
      
      return (
        <div className="mb-3">
          <div 
            className={cn(
              "bg-muted rounded-lg px-4 py-2",
              hasLongParams && "cursor-pointer hover:bg-muted/80 transition-colors"
            )}
            onClick={() => hasLongParams && setExpanded(!expanded)}
          >
            <div className="flex items-center gap-2">
              <Icon name="build" size="sm" className="text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium">
                {message.tool_name}
                <span className="font-normal text-muted-foreground">
                  ({expanded || !hasLongParams ? paramsStr : paramsStr.slice(0, 60) + '...'})
                </span>
              </span>
              {hasLongParams && (
                <Icon 
                  name={expanded ? 'expand_less' : 'expand_more'} 
                  size="sm" 
                  className="text-muted-foreground ml-auto flex-shrink-0" 
                />
              )}
            </div>
          </div>
        </div>
      )
    
    case 'tool_result':
      // Determine if result indicates success or has data
      const hasError = typeof parsed === 'object' && 'error' in parsed
      const resultColor = hasError ? 'text-destructive' : 'text-green-600 dark:text-green-400'
      
      return (
        <div className="mb-3">
          <div 
            className={cn(
              "rounded-lg px-4 py-2 border",
              hasError ? "border-destructive/30 bg-destructive/5" : "border-green-500/30 bg-green-500/5",
              needsExpand(parsed) && "cursor-pointer hover:opacity-80 transition-opacity"
            )}
            onClick={() => needsExpand(parsed) && setExpanded(!expanded)}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon 
                name={hasError ? 'error' : 'check_circle'} 
                size="sm" 
                className={resultColor} 
              />
              <span className={cn("text-sm font-medium", resultColor)}>
                {message.tool_name} result
              </span>
              {needsExpand(parsed) && (
                <Icon 
                  name={expanded ? 'expand_less' : 'expand_more'} 
                  size="sm" 
                  className="text-muted-foreground ml-auto" 
                />
              )}
            </div>
            <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
              {expanded ? JSON.stringify(parsed, null, 2) : getPreview(parsed)}
            </pre>
          </div>
        </div>
      )
    
    case 'assistant':
      return (
        <div className="mb-3">
          <div className="bg-secondary rounded-lg px-4 py-2">
            <div className="flex items-center gap-2 mb-1">
              <Icon name="smart_toy" size="sm" className="text-secondary-foreground" />
              <span className="text-sm font-medium">Assistant</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      )
    
    default:
      return null
  }
}

// Status indicator component
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: string; label: string; variant: 'secondary' | 'default' | 'destructive'; animate?: boolean }> = {
    pending: { icon: 'hourglass_empty', label: 'Pending', variant: 'secondary' },
    running: { icon: 'progress_activity', label: 'Running', variant: 'default', animate: true },
    completed: { icon: 'check_circle', label: 'Completed', variant: 'default' },
    failed: { icon: 'error', label: 'Failed', variant: 'destructive' },
  }
  
  const { icon, label, variant, animate = false } = config[status] || config.pending
  
  return (
    <Badge variant={variant} className="gap-1">
      <Icon name={icon} size="sm" className={animate ? 'animate-spin' : ''} />
      {label}
    </Badge>
  )
}

export function AiChatPanel({ sessionId, historyMode = false, onComplete, className }: AiChatPanelProps) {
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [status, setStatus] = useState<string>('pending')
  const [error, setError] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(!historyMode)
  const [isLoading, setIsLoading] = useState(historyMode)
  const [loadError, setLoadError] = useState<string | null>(null)
  const lastMessageIdRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])
  
  // History mode: load all messages once
  useEffect(() => {
    if (!historyMode || !sessionId) return
    
    const loadHistory = async () => {
      setIsLoading(true)
      setLoadError(null)
      
      try {
        const response = await api.getAiMessages(sessionId)
        setMessages(response.messages)
        setStatus(response.session.status)
        if (response.session.error_message) {
          setError(response.session.error_message)
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load chat history')
      } finally {
        setIsLoading(false)
      }
    }
    
    loadHistory()
  }, [sessionId, historyMode])
  
  // Polling mode: poll for new messages
  useEffect(() => {
    if (!isPolling || !sessionId || historyMode) return
    
    const pollMessages = async () => {
      try {
        const response: AiMessagesResponse = await api.getAiMessages(
          sessionId, 
          lastMessageIdRef.current
        )
        
        if (response.messages.length > 0) {
          setMessages(prev => [...prev, ...response.messages])
          lastMessageIdRef.current = response.messages[response.messages.length - 1].id
        }
        
        setStatus(response.session.status)
        
        if (response.session.error_message) {
          setError(response.session.error_message)
        }
        
        // Stop polling when complete or failed
        if (response.session.status === 'completed' || response.session.status === 'failed') {
          setIsPolling(false)
          onComplete?.()
        }
      } catch (err) {
        console.error('Failed to poll AI messages:', err)
        // Don't stop polling on transient errors
      }
    }
    
    // Initial poll
    pollMessages()
    
    // Poll every 500ms
    const interval = setInterval(pollMessages, 500)
    
    return () => clearInterval(interval)
  }, [sessionId, isPolling, historyMode, onComplete])
  
  // Loading state for history mode
  if (isLoading) {
    return (
      <div className={cn("flex flex-col items-center justify-center", className)}>
        <Icon name="progress_activity" className="animate-spin mb-2" />
        <span className="text-sm text-muted-foreground">Loading history...</span>
      </div>
    )
  }
  
  // Error state for history mode
  if (loadError) {
    return (
      <div className={cn("flex flex-col items-center justify-center text-muted-foreground", className)}>
        <Icon name="error" className="mb-2 text-destructive" />
        <p>{loadError}</p>
        {loadError.includes('No session found') && (
          <p className="text-sm mt-2">This item may have been created before chat logging was enabled.</p>
        )}
      </div>
    )
  }
  
  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      {/* Header with status */}
      <div className="flex-shrink-0 flex items-center justify-between pb-3 border-b mb-3">
        <span className="text-sm font-medium">AI Generation</span>
        <StatusBadge status={status} />
      </div>
      
      {/* Messages area */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-2" ref={scrollRef}>
        <div className="space-y-1">
          {messages.length === 0 && status === 'pending' && !historyMode && (
            <div className="text-center text-muted-foreground py-8">
              <Icon name="hourglass_empty" className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Waiting for AI to start...</p>
            </div>
          )}
          
          {messages.length === 0 && status === 'running' && !historyMode && (
            <div className="text-center text-muted-foreground py-8">
              <Icon name="progress_activity" className="mx-auto mb-2 animate-spin" />
              <p className="text-sm">AI is analyzing the page...</p>
            </div>
          )}
          
          {messages.length === 0 && historyMode && (
            <div className="text-center text-muted-foreground py-8">
              <Icon name="chat" className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No messages recorded</p>
            </div>
          )}
          
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          
          {status === 'running' && messages.length > 0 && !historyMode && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon name="progress_activity" size="sm" className="animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Error display */}
      {error && (
        <div className="flex-shrink-0 mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
          <div className="flex items-center gap-2 text-destructive">
            <Icon name="error" size="sm" />
            <span className="text-sm font-medium">Generation failed</span>
          </div>
          <p className="text-sm text-destructive/80 mt-1">{error}</p>
        </div>
      )}
      
      {/* Success indicator */}
      {status === 'completed' && !error && (
        <div className="flex-shrink-0 mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <Icon name="check_circle" size="sm" />
            <span className="text-sm font-medium">Script generated successfully</span>
          </div>
        </div>
      )}
    </div>
  )
}
