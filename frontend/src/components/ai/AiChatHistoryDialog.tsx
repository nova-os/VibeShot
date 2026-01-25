import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { AiChatPanel } from '@/components/ai/AiChatPanel'
import { api, AiSession } from '@/lib/api'

interface AiChatHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: 'instruction' | 'test'
  targetId: number
  targetName: string
}

export function AiChatHistoryDialog({
  open,
  onOpenChange,
  type,
  targetId,
  targetName,
}: AiChatHistoryDialogProps) {
  const [session, setSession] = useState<AiSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      // Reset state when dialog closes
      setSession(null)
      setIsLoading(true)
      setError(null)
      return
    }
    
    const loadSession = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        const sessionData = await api.getLatestAiSession(type, targetId)
        setSession(sessionData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session')
      } finally {
        setIsLoading(false)
      }
    }
    
    loadSession()
  }, [open, type, targetId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="smart_toy" />
            AI Generation History
          </DialogTitle>
          <DialogDescription>
            View the AI interaction for "{targetName}"
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 min-h-[300px] overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Icon name="progress_activity" className="animate-spin mb-2" />
              <span className="text-sm text-muted-foreground">Loading session...</span>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Icon name="error" className="mb-2 text-destructive" />
              <p>{error}</p>
              {error.includes('No session found') && (
                <p className="text-sm mt-2">This item may have been created before chat logging was enabled.</p>
              )}
            </div>
          ) : session ? (
            <AiChatPanel 
              sessionId={session.id} 
              historyMode 
              className="flex-1 min-h-0"
            />
          ) : null}
        </div>
        
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
