'use client'

import { useState } from 'react'
import { ChatPanel } from './chat-panel'
import type { UserRole } from '@/lib/types'

interface Props {
  role: UserRole
  branchId: string
}

export function ChatTrigger({ role, branchId }: Props) {
  const [open, setOpen] = useState(false)

  // The owner role has no chat presence — there's no owner-specific
  // workflow built yet for anyone to message them about.
  if (role === 'owner') return null

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Trò chuyện" className="flex items-center justify-center">
        <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
          chat
        </span>
      </button>
      {open && <ChatPanel branchId={branchId} onClose={() => setOpen(false)} />}
    </>
  )
}
