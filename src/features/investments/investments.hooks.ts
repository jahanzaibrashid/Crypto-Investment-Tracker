import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/features/auth/auth.context'
import {
  createInvestment,
  createSale,
  deleteInvestment,
  deleteSale,
  fetchInvestments,
  importInvestments,
  reorderOpenInvestments,
  updateInvestment,
  updateInvestmentNote,
} from './investments.service'
import type { ImportLotInput, Investment, InvestmentInput, SaleInput } from './investments.types'

/** Keys are scoped to the user so cached data can never cross accounts. */
export const investmentKeys = {
  all: (userId: string) => ['investments', userId] as const,
}

export function useInvestments() {
  const userId = useUserId()
  return useQuery({
    queryKey: investmentKeys.all(userId),
    queryFn: fetchInvestments,
  })
}

export function useInvestmentMutations() {
  const userId = useUserId()
  const qc = useQueryClient()
  const key = investmentKeys.all(userId)
  const invalidate = () => qc.invalidateQueries({ queryKey: key })

  const create = useMutation({
    mutationFn: (input: InvestmentInput) => createInvestment(input),
    onSettled: invalidate,
  })

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: InvestmentInput }) => updateInvestment(id, input),
    onSettled: invalidate,
  })

  // Optimistic removal is safe: on failure the snapshot is restored.
  const remove = useMutation({
    mutationFn: (id: string) => deleteInvestment(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Investment[]>(key)
      qc.setQueryData<Investment[]>(key, (list) => list?.filter((i) => i.id !== id))
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: invalidate,
  })

  const updateNote = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string | null }) => updateInvestmentNote(id, note),
    onMutate: async ({ id, note }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Investment[]>(key)
      qc.setQueryData<Investment[]>(key, (list) => list?.map((i) => (i.id === id ? { ...i, note: note?.trim() || null } : i)))
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: invalidate,
  })

  // Sales change derived status in the database; not optimistic, refetch instead.
  const sell = useMutation({
    mutationFn: (input: SaleInput) => createSale(input),
    onSettled: invalidate,
  })

  const removeSale = useMutation({
    mutationFn: (saleId: string) => deleteSale(saleId),
    onSettled: invalidate,
  })

  const importLots = useMutation({
    mutationFn: (lots: ImportLotInput[]) => importInvestments(lots),
    onSettled: invalidate,
  })

  // Optimistic: rows take their new places immediately; on failure the snapshot is restored.
  // Mirrors the database: the top lot keeps the highest current value, each next one is one lower.
  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderOpenInvestments(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Investment[]>(key)
      const top = Math.max(...(previous ?? []).filter((i) => ids.includes(i.id)).map((i) => i.sortOrder))
      const next = new Map(ids.map((id, pos) => [id, top - pos]))
      qc.setQueryData<Investment[]>(key, (list) => list?.map((i) => (next.has(i.id) ? { ...i, sortOrder: next.get(i.id)! } : i)))
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: invalidate,
  })

  return { create, update, remove, updateNote, sell, removeSale, importLots, reorder }
}
