import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormAlert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/toast.context'
import { LIMITS } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/formatters'
import { useInvestmentMutations } from './investments.hooks'
import { noteFormSchema } from './investments.schemas'
import type { Investment } from './investments.types'

function NoteForm({ investment, onDone }: { investment: Investment; onDone: () => void }) {
  const { updateNote } = useInvestmentMutations()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ note: string }>({ resolver: zodResolver(noteFormSchema), defaultValues: { note: investment.note ?? '' } })

  const submit = handleSubmit(async ({ note }) => {
    setError(null)
    try {
      await updateNote.mutateAsync({ id: investment.id, note })
      toast.success('Note saved.')
      onDone()
    } catch (e) {
      setError(errorMessage(e))
    }
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <Textarea label="Note" rows={5} maxLength={LIMITS.noteMax} data-autofocus error={errors.note?.message} {...register('note')} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          Save note
        </Button>
      </div>
    </form>
  )
}

export function NoteDialog({ investment, onClose }: { investment: Investment | null; onClose: () => void }) {
  return (
    <Dialog
      open={investment !== null}
      onClose={onClose}
      title="Investment note"
      description={investment ? `${investment.coinName} (${investment.symbol}) bought ${formatDate(investment.buyDate)}` : undefined}
    >
      {investment && <NoteForm key={investment.id} investment={investment} onDone={onClose} />}
    </Dialog>
  )
}
