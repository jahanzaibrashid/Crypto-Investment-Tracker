import type { ReactNode } from 'react'

export function PageContainer({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6">{children}</main>
}
