import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Test } from '@/lib/api'
import { TestCard } from './TestCard'
import { AddTestDialog } from './AddTestDialog'
import { EditTestDialog } from './EditTestDialog'
import { DeleteTestDialog } from './DeleteTestDialog'
import { useReorderTests } from '@/hooks/useQueries'
import { toast } from 'sonner'

interface TestsListProps {
  pageId: number
  tests: Test[]
}

export function TestsList({ pageId, tests }: TestsListProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editTest, setEditTest] = useState<Test | null>(null)
  const [deleteTest, setDeleteTest] = useState<Test | null>(null)
  
  const reorderTests = useReorderTests()

  const handleMove = (testId: number, direction: 'up' | 'down') => {
    const index = tests.findIndex(t => t.id === testId)
    if (index === -1) return

    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= tests.length) return

    const testIds = tests.map(t => t.id)
    ;[testIds[index], testIds[newIndex]] = [testIds[newIndex], testIds[index]]

    reorderTests.mutate(
      { pageId, testIds },
      {
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to reorder tests')
        },
      }
    )
  }

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">AI Tests</h3>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Icon name="add" size="sm" />
          Add Test
        </Button>
      </div>

      {/* List */}
      {tests.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-lg">
          <p className="text-muted-foreground text-sm">
            No tests configured. Add tests to verify page content and behavior during screenshot captures.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tests.map((test, index) => (
            <TestCard
              key={test.id}
              test={test}
              index={index}
              totalCount={tests.length}
              pageId={pageId}
              onEdit={() => setEditTest(test)}
              onDelete={() => setDeleteTest(test)}
              onMove={(dir) => handleMove(test.id, dir)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <AddTestDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        pageId={pageId}
      />

      {editTest && (
        <EditTestDialog
          open={!!editTest}
          onOpenChange={(open) => !open && setEditTest(null)}
          test={editTest}
          pageId={pageId}
        />
      )}

      {deleteTest && (
        <DeleteTestDialog
          open={!!deleteTest}
          onOpenChange={(open) => !open && setDeleteTest(null)}
          test={deleteTest}
          pageId={pageId}
        />
      )}
    </div>
  )
}
