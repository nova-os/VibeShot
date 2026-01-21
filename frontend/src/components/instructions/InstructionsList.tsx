import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Instruction, api } from '@/lib/api'
import { InstructionCard } from './InstructionCard'
import { AddInstructionDialog } from './AddInstructionDialog'
import { EditInstructionDialog } from './EditInstructionDialog'
import { DeleteInstructionDialog } from './DeleteInstructionDialog'
import { toast } from 'sonner'

interface InstructionsListProps {
  pageId: number
  instructions: Instruction[]
  onUpdate: () => void
}

export function InstructionsList({ pageId, instructions, onUpdate }: InstructionsListProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editInstruction, setEditInstruction] = useState<Instruction | null>(null)
  const [deleteInstruction, setDeleteInstruction] = useState<Instruction | null>(null)

  const handleMove = useCallback(async (instructionId: number, direction: 'up' | 'down') => {
    const index = instructions.findIndex(i => i.id === instructionId)
    if (index === -1) return

    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= instructions.length) return

    const instructionIds = instructions.map(i => i.id)
    ;[instructionIds[index], instructionIds[newIndex]] = [instructionIds[newIndex], instructionIds[index]]

    try {
      await api.reorderInstructions(pageId, instructionIds)
      onUpdate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reorder instructions')
    }
  }, [pageId, instructions, onUpdate])

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">AI Instructions</h3>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Icon name="add" size="sm" />
          Add Instruction
        </Button>
      </div>

      {/* List */}
      {instructions.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-lg">
          <p className="text-muted-foreground text-sm">
            No instructions configured. Add instructions to automate page interactions before screenshots are captured.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {instructions.map((instruction, index) => (
            <InstructionCard
              key={instruction.id}
              instruction={instruction}
              index={index}
              totalCount={instructions.length}
              pageId={pageId}
              onUpdate={onUpdate}
              onEdit={() => setEditInstruction(instruction)}
              onDelete={() => setDeleteInstruction(instruction)}
              onMove={(dir) => handleMove(instruction.id, dir)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <AddInstructionDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        pageId={pageId}
        onSuccess={onUpdate}
      />

      {editInstruction && (
        <EditInstructionDialog
          open={!!editInstruction}
          onOpenChange={(open) => !open && setEditInstruction(null)}
          instruction={editInstruction}
          pageId={pageId}
          onSuccess={onUpdate}
        />
      )}

      {deleteInstruction && (
        <DeleteInstructionDialog
          open={!!deleteInstruction}
          onOpenChange={(open) => !open && setDeleteInstruction(null)}
          instruction={deleteInstruction}
          pageId={pageId}
          onSuccess={onUpdate}
        />
      )}
    </div>
  )
}
