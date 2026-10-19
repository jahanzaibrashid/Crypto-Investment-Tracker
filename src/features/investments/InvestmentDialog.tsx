import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/toast.context'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatQuantity } from '@/lib/formatters'
import { FormAlert } from '@/components/ui/Alert'
import { InvestmentForm } from './InvestmentForm'
import { useInvestmentMutations } from './investments.hooks'
import type { Investment, InvestmentInput } from './investments.types'
import type { LotMetrics } from './investments.utils'

interface InvestmentDialogProps {
  open: boolean
  onClose: () => void
  /** When provided the dialog edits this lot. */
  lot?: LotMetrics | null
  /** Suggestions for "Bought on" (exchangeOptions of all investments). */
  exchangeOptions: string[]
}

export function InvestmentDialog({ open, onClose, lot, exchangeOptions }: InvestmentDialogProps) {
  const { create, update } = useInvestmentMutations()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const editing: Investment | undefined = lot?.investment
  const pending = create.isPending || update.isPending

  const handleSubmit = async (input: InvestmentInput) => {
    setError(null)
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input })
        toast.success(`Updated ${input.coinName} purchase.`)
      } else {
        await create.mutateAsync(input)
        toast.success(`Added ${input.coinName} purchase.`)
      }
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const close = () => {
    setError(null)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!pending}
      title={editing ? 'Edit investment' : 'Add investment'}
      description={
        editing
          ? `${editing.coinName} (${editing.symbol}): ${formatQuantity(editing.quantity)} ${editing.symbol} bought on ${formatDate(editing.buyDate)}.`
          : 'Record a coin purchase. Prices are in USD.'
      }
      size="lg"
    >
      {error && <FormAlert tone="error">{error}</FormAlert>}
      {open && (
        <InvestmentForm
          key={editing?.id ?? 'new'}
          initial={editing}
          soldQuantity={lot?.soldQuantity.toFixed()}
          firstSaleDate={lot?.sales[0]?.sale.soldDate ?? null}
          exchangeOptions={exchangeOptions}
          submitLabel={editing ? 'Save changes' : 'Add investment'}
          onSubmit={handleSubmit}
          onCancel={close}
        />
      )}
    </Dialog>
  )
}
