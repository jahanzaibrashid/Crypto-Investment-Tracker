import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/features/auth/auth.context'
import { getSupabase } from '@/lib/supabase'
import { ConflictError } from '@/lib/errors'
import { fetchPortfolioNote, savePortfolioNote, type PortfolioNote } from './notes.service'

export const noteKeys = {
  portfolio: (userId: string) => ['portfolio-note', userId] as const,
}

export function usePortfolioNote() {
  const userId = useUserId()
  return useQuery({ queryKey: noteKeys.portfolio(userId), queryFn: fetchPortfolioNote })
}

export function useSavePortfolioNote() {
  const userId = useUserId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ note, version }: { note: string; version: number }) => savePortfolioNote(note, version),
    onSuccess: (saved) => qc.setQueryData(noteKeys.portfolio(userId), saved),
    onError: (err) => {
      if (err instanceof ConflictError && err.latest) {
        qc.setQueryData(noteKeys.portfolio(userId), err.latest as PortfolioNote)
      }
    },
  })
}

/**
 * Push note changes from the user's other devices via Supabase Realtime.
 * The channel is filtered to the user's own row, RLS is enforced server-side,
 * and the subscription is removed on unmount / user change.
 */
export function usePortfolioNoteRealtime() {
  const userId = useUserId()
  const qc = useQueryClient()
  useEffect(() => {
    const supabase = getSupabase()
    const channel = supabase
      .channel(`portfolio-note:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'portfolio_notes', filter: `user_id=eq.${userId}` },
        () => {
          void qc.invalidateQueries({ queryKey: noteKeys.portfolio(userId) })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, qc])
}
