import { useState } from 'react'
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
import { Icon } from '@/components/ui/icon'
import { useCreateSite } from '@/hooks/useQueries'
import { toast } from 'sonner'

interface AddSiteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddSiteDialog({ open, onOpenChange }: AddSiteDialogProps) {
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const createSite = useCreateSite()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    createSite.mutate(
      { name, domain },
      {
        onSuccess: () => {
          toast.success('Site added successfully')
          setName('')
          setDomain('')
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to create site')
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Site</DialogTitle>
          <DialogDescription>
            Add a new website to monitor with automated screenshots.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="site-name">Site Name</Label>
              <Input
                id="site-name"
                placeholder="My Website"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={createSite.isPending}
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
                disabled={createSite.isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={createSite.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createSite.isPending}>
              {createSite.isPending ? (
                <>
                  <Icon name="progress_activity" className="animate-spin" size="sm" />
                  Adding...
                </>
              ) : (
                'Add Site'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
