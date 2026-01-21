import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { api, Page } from '@/lib/api'
import { toast } from 'sonner'

interface DeletePageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  page: Page
  siteId: number
}

export function DeletePageDialog({ open, onOpenChange, page, siteId }: DeletePageDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const handleDelete = async () => {
    setIsLoading(true)

    try {
      await api.deletePage(page.id)
      toast.success('Page deleted successfully')
      onOpenChange(false)
      navigate(`/sites/${siteId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete page')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Page</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{page.name}</strong>?
            <br />
            <span className="text-muted-foreground">
              This will also delete all screenshots for this page.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={isLoading}>
            {isLoading ? (
              <>
                <Icon name="progress_activity" className="animate-spin" size="sm" />
                Deleting...
              </>
            ) : (
              'Delete Page'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
