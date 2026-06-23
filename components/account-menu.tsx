'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BranchSelector } from './branch-selector'
import { useLanguage } from '@/lib/language-context'
import type { UserRole } from '@/lib/types'

const ROLE_LABELS: Record<UserRole, { vi: string; en: string }> = {
  foh: { vi: 'Nhân viên', en: 'Staff' },
  kitchen: { vi: 'Bếp', en: 'Kitchen' },
  manager: { vi: 'Quản lý', en: 'Manager' },
  register: { vi: 'Thu ngân', en: 'Cashier' },
  owner: { vi: 'Chủ quán', en: 'Owner' },
}

interface Props {
  fullName: string | null
  role: UserRole
  branchId?: string
  onBranchChange?: (id: string) => void
}

export function AccountMenu({ fullName, role, branchId, onBranchChange }: Props) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()
  const { language, setLanguage, t } = useLanguage()

  function close() {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, 150)
  }

  useEffect(() => {
    if (!open) return

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
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
        onClick={() => (open ? close() : setOpen(true))}
        className="flex items-center gap-2 min-h-touch-target-min px-1 rounded-lg hover:bg-surface-container-high transition-colors"
        aria-label={t('Tài khoản', 'Account')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-[13px]">
          {(fullName ?? '?').charAt(0).toUpperCase()}
        </span>
        <span className="hidden md:block text-left leading-tight">
          <span className="block text-label-vi font-bold text-on-surface">{fullName ?? t('Tài khoản', 'Account')}</span>
          <span className="block text-label-en text-on-surface-variant">{t(ROLE_LABELS[role].vi, ROLE_LABELS[role].en)}</span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 top-full mt-1 w-56 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-lg z-50 overflow-hidden ${
            closing ? 'animate-slide-out-up' : 'animate-slide-in-down'
          }`}
        >
          <div className="p-stack-md border-b border-outline-variant">
            <p className="text-label-vi font-bold text-on-surface">{fullName ?? t('Tài khoản', 'Account')}</p>
            <p className="text-label-en text-on-surface-variant">{t(ROLE_LABELS[role].vi, ROLE_LABELS[role].en)}</p>
          </div>

          {(role === 'manager' || role === 'owner') && branchId && onBranchChange && (
            <div className="p-stack-md border-b border-outline-variant">
              <p className="text-label-en text-on-surface-variant mb-1">{t('Chi nhánh', 'Branch')}</p>
              <BranchSelector branchId={branchId} onBranchChange={onBranchChange} />
            </div>
          )}

          <div className="p-stack-md border-b border-outline-variant">
            <p className="text-label-en text-on-surface-variant mb-1">{t('Ngôn ngữ', 'Language')}</p>
            <div className="flex rounded-lg border border-outline-variant overflow-hidden">
              <button
                onClick={() => setLanguage('vi')}
                className={`flex-1 py-1.5 min-h-touch-target-min text-label-vi font-bold transition-colors ${
                  language === 'vi' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                VI
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`flex-1 py-1.5 min-h-touch-target-min text-label-vi font-bold transition-colors ${
                  language === 'en' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                EN
              </button>
            </div>
          </div>

          <button
            role="menuitem"
            onClick={handleLogout}
            className="w-full text-left p-stack-md text-error font-bold text-label-vi hover:bg-error-container transition-colors"
          >
            {t('Đăng xuất', 'Log out')}
          </button>
        </div>
      )}
    </div>
  )
}
