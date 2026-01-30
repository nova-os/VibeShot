import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Instruction } from '@/lib/api'
import { InstructionCard } from './InstructionCard'
import { AddInstructionDialog } from './AddInstructionDialog'
import { EditInstructionDialog } from './EditInstructionDialog'
import { DeleteInstructionDialog } from './DeleteInstructionDialog'
import { useReorderInstructions } from '@/hooks/useQueries'
import { toast } from 'sonner'

interface InstructionsListProps {
  pageId: number
  instructions: Instruction[]
}

export function InstructionsList({ pageId, instructions }: InstructionsListProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editInstruction, setEditInstruction] = useState<Instruction | null>(null)
  const [deleteInstruction, setDeleteInstruction] = useState<Instruction | null>(null)
  
  const reorderInstructions = useReorderInstructions()

  const handleMove = (instructionId: number, direction: 'up' | 'down') => {
    const index = instructions.findIndex(i => i.id === instructionId)
    if (index === -1) return

    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= instructions.length) return

    const instructionIds = instructions.map(i => i.id)
    ;[instructionIds[index], instructionIds[newIndex]] = [instructionIds[newIndex], instructionIds[index]]

    reorderInstructions.mutate(
      { pageId, instructionIds },
      {
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to reorder instructions')
        },
      }
    )
  }

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
      />

      {editInstruction && (
        <EditInstructionDialog
          open={!!editInstruction}
          onOpenChange={(open) => !open && setEditInstruction(null)}
          instruction={editInstruction}
          pageId={pageId}
        />
      )}

      {deleteInstruction && (
        <DeleteInstructionDialog
          open={!!deleteInstruction}
          onOpenChange={(open) => !open && setDeleteInstruction(null)}
          instruction={deleteInstruction}
          pageId={pageId}
        />
      )}
    </div>
  )
}
