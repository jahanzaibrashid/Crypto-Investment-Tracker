import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormAlert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/toast.context'
import { errorMessage } from '@/lib/errors'
import { formatDate, parseDate, todayIso } from '@/lib/formatters'
import { useCycleMutations } from './strategy.hooks'
import { cycleFormSchema, DEFAULT_CYCLE_DAYS, MAX_CYCLE_DAYS, toCycleInput, toCycleSettings, type CycleFormValues } from './strategy.schemas'
import type { TradingCycle } from './strategy.types'
import { addDays, cycleEndDate, daysBetween } from './strategy.utils'

export type CycleDialogMode = { kind: 'start'; latest: TradingCycle | null } | { kind: 'edit'; cycle: TradingCycle }

function defaults(mode: CycleDialogMode): CycleFormValues {
  if (mode.kind === 'edit') {
    const c = mode.cycle
    return { startDate: c.startDate, lengthDays: String(c.lengthDays), dailyTarget: c.dailyTarget }
  }
  // A new cycle reuses the latest cycle's settings and starts today.
  const prev = mode.latest
  return {
    startDate: todayIso(),
    lengthDays: String(prev?.lengthDays ?? DEFAULT_CYCLE_DAYS),
    dailyTarget: prev?.dailyTarget ?? '',
  }
}

function CycleForm({ mode, onDone, onDelete }: { mode: CycleDialogMode; onDone: () => void; onDelete?: () => void }) {
  const { start, update } = useCycleMutations()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CycleFormValues>({ resolver: zodResolver(cycleFormSchema), defaultValues: defaults(mode), mode: 'onTouched' })

  const latest = mode.kind === 'start' ? mode.latest : null
  const startDate = useWatch({ control, name: 'startDate' })
  const lengthText = useWatch({ control, name: 'lengthDays' })
  // End date = start + length − 1. Users pick the end date; the length is derived from it.
  const length = /^\d+$/.test(lengthText.trim()) ? Number(lengthText) : null
  const endDate = parseDate(startDate) === startDate && length !== null && length >= 1 ? addDays(startDate, length - 1) : ''
  const [endError, setEndError] = useState<string | undefined>()
  const onEndDate = (value: string) => {
    const iso = parseDate(value)
    if (!iso || parseDate(startDate) !== startDate) return setEndError('Enter a valid end date')
    const days = daysBetween(startDate, iso) + 1
    if (days < 1) return setEndError('The end date must be on or after the start date')
    if (days > MAX_CYCLE_DAYS) return setEndError(`A cycle can be at most ${MAX_CYCLE_DAYS} days`)
    setEndError(undefined)
    setValue('lengthDays', String(days), { shouldValidate: true })
  }
  // The latest cycle is closed early if it is still running on the new start date.
  const closesLatest = latest !== null && startDate > latest.startDate && startDate <= cycleEndDate(latest)

  const submit = handleSubmit(async (values) => {
    setError(null)
    try {
      if (mode.kind === 'edit') {
        const startDate = values.startDate !== mode.cycle.startDate ? values.startDate : undefined
        await update.mutateAsync({ id: mode.cycle.id, settings: toCycleSettings(values, mode.cycle.capital), startDate })
        toast.success('Cycle updated. Targets were recalculated.')
      } else {
        await start.mutateAsync(toCycleInput(values))
        toast.success(`New ${values.lengthDays}-day cycle started on ${formatDate(values.startDate)}.`)
      }
      onDone()
    } catch (e) {
      setError(errorMessage(e))
    }
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="Trading cycle form">
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Start date: editable when starting and when editing (e.g. move it back to include earlier sales). */}
        {
          <Controller
            control={control}
            name="startDate"
            render={({ field, fieldState }) => (
              <DateInput
                label="Start date"
                value={field.value}
                onChange={(value) => {
                  // Keep the end date where it is: a new start date changes the number of days.
                  const end = endDate
                  field.onChange(value)
                  if (end && parseDate(value) === value) {
                    const days = daysBetween(value, end) + 1
                    if (days >= 1 && days <= MAX_CYCLE_DAYS) setValue('lengthDays', String(days), { shouldValidate: true })
                  }
                }}
                onBlur={field.onBlur}
                min={latest ? addDays(latest.startDate, 1) : undefined}
                error={fieldState.error?.message}
                hint={mode.kind === 'edit' ? 'Move it back to include earlier sales. It must stay after the previous cycle’s start.' : undefined}
              />
            )}
          />
        }
        {/* The cycle length is worked out from the end date (the database stores the length). */}
        <DateInput
          label="End date"
          value={endDate}
          onChange={onEndDate}
          min={startDate}
          error={endError ?? errors.lengthDays?.message}
          hint={length !== null ? `${length} day${length === 1 ? '' : 's'} (start and end dates included). Default ${DEFAULT_CYCLE_DAYS} days.` : undefined}
        />
        <Input label="Daily profit target" inputMode="decimal" leading="$" placeholder="30" hint="Realized profit you aim for per day." error={errors.dailyTarget?.message} {...register('dailyTarget')} />
        <Input label="Fee per trade (%)" value="0" disabled readOnly hint="Fees are not used: always 0." />
      </div>
      {closesLatest && latest && (
        <FormAlert tone="info">
          Your current cycle ({formatDate(latest.startDate)} – {formatDate(cycleEndDate(latest))}) will end on {formatDate(addDays(startDate, -1))}. Its
          history is kept.
        </FormAlert>
      )}
      {mode.kind === 'edit' && (
        <p className="text-xs text-muted-foreground">
          Changing these values recalculates every day of this cycle. Moving the start date changes which sales are counted; if it now overlaps the
          previous cycle, that cycle ends the day before. Your trades are not changed.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {mode.kind === 'edit' && onDelete && (
          <Button variant="ghost" className="mr-auto text-destructive-text" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={onDelete} disabled={isSubmitting}>
            Delete cycle
          </Button>
        )}
        <Button variant="ghost" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {mode.kind === 'edit' ? 'Save changes' : 'Start cycle'}
        </Button>
      </div>
    </form>
  )
}

export function CycleDialog({ mode, onClose, onDelete }: { mode: CycleDialogMode | null; onClose: () => void; onDelete?: () => void }) {
  return (
    <Dialog
      open={mode !== null}
      onClose={onClose}
      title={mode?.kind === 'edit' ? 'Edit trading cycle' : 'Start a trading cycle'}
      description="Targets are informational. Nothing here places or connects to trades."
    >
      {mode && <CycleForm key={mode.kind === 'edit' ? mode.cycle.id : 'start'} mode={mode} onDone={onClose} onDelete={onDelete} />}
    </Dialog>
  )
}
