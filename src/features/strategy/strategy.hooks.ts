import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/features/auth/auth.context'
import { changeCycleStart, deleteCycle, fetchCycles, startCycle, updateCycle } from './strategy.service'
import type { CycleInput, CycleSettings } from './strategy.types'

/** Keys are scoped to the user so cached data can never cross accounts. */
export const cycleKeys = {
  all: (userId: string) => ['trading-cycles', userId] as const,
}

export function useTradingCycles() {
  const userId = useUserId()
  return useQuery({ queryKey: cycleKeys.all(userId), queryFn: fetchCycles })
}

export function useCycleMutations() {
  const userId = useUserId()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: cycleKeys.all(userId) })

  const start = useMutation({
    mutationFn: (input: CycleInput) => startCycle(input),
    onSettled: invalidate,
  })

  const update = useMutation({
    // The start date (if changed) is moved first, so a rejected date leaves the settings untouched.
    mutationFn: async ({ id, settings, startDate }: { id: string; settings: CycleSettings; startDate?: string }) => {
      if (startDate) await changeCycleStart(id, startDate)
      await updateCycle(id, settings)
    },
    onSettled: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteCycle(id),
    onSettled: invalidate,
  })

  return { start, update, remove }
}
