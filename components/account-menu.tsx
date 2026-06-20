'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BranchSelector } from './branch-selector'
import type { UserRole } from '@/lib/types'

const ROLE_LABELS: Record<UserRole, string> = {
  foh: 'Nhân viên',
  kitchen: 'Bếp',
  manager: 'Quản lý',
  register: 'Thu ngân',
}

interface Props {
  fullName: string | null
  role: UserRole
  branchId?: string
  onBranchChange?: (id: string) => void
}

export function AccountMenu({ fullName, role, branchId, onBranchChange }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (!open) return

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-2 min-h-touch-target-min px-1"
        aria-label="Tài khoản"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-[13px]">
          {(fullName ?? '?').charAt(0).toUpperCase()}
        </span>
        <span className="hidden md:block text-left leading-tight">
          <span className="block text-label-vi font-bold text-on-surface">{fullName ?? 'Tài khoản'}</span>
          <span className="block text-label-en text-on-surface-variant">{ROLE_LABELS[role]}</span>
        </span>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-lg z-50 overflow-hidden">
          <div className="p-stack-md border-b border-outline-variant">
            <p className="text-label-vi font-bold text-on-surface">{fullName ?? 'Tài khoản'}</p>
            <p className="text-label-en text-on-surface-variant">{ROLE_LABELS[role]}</p>
          </div>

          {role === 'manager' && branchId && onBranchChange && (
            <div className="p-stack-md border-b border-outline-variant">
              <p className="text-label-en text-on-surface-variant mb-1">Chi nhánh</p>
              <BranchSelector branchId={branchId} onBranchChange={onBranchChange} />
            </div>
          )}

          <button
            role="menuitem"
            onClick={handleLogout}
            className="w-full text-left p-stack-md text-error font-bold text-label-vi hover:bg-error-container transition-colors"
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  )
}
