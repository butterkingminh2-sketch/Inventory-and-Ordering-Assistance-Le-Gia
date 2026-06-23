'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SidebarNav } from '@/components/sidebar-nav'
import { BottomNav } from '@/components/bottom-nav'
import { AccountMenu } from '@/components/account-menu'
import { ChatTrigger } from '@/components/chat-trigger'
import { IdleLogoutGuard } from '@/components/idle-logout-guard'
import { LanguageProvider } from '@/lib/language-context'
import type { Branch, Language, UserRole } from '@/lib/types'

interface BranchContextValue {
  branchId: string
  setBranchId: (id: string) => void
}

export const BranchContext = createContext<BranchContextValue>({
  branchId: '',
  setBranchId: () => {},
})

export function useBranch() {
  return useContext(BranchContext)
}

interface Props {
  role: UserRole
  defaultBranchId: string
  fullName: string | null
  language: Language
  userId: string
  children: React.ReactNode
}

export function AppShell({ role, defaultBranchId, fullName, language, userId, children }: Props) {
  const [branchId, setBranchId] = useState(defaultBranchId)
  const [branches, setBranches] = useState<Branch[]>([])
  const [readyCount, setReadyCount] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      if (data) setBranches(data)
    })
  }, [])

  useEffect(() => {
    async function fetchCount() {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('branch_id', branchId)
        .eq('status', 'ready')
      setReadyCount(count ?? 0)
    }

    fetchCount()

    const channel = supabase
      .channel(`ready-count-${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        () => fetchCount(),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [branchId])

  const currentBranchName = branches.find(b => b.id === branchId)?.name
  const canSwitchBranch = role === 'manager' || role === 'owner'
  // Manager/owner have access to financial data and settings, so an
  // unattended session there is riskier than an unattended FOH one.
  const idleTimeoutMinutes = canSwitchBranch ? 5 : 15

  return (
    <LanguageProvider initialLanguage={language} userId={userId}>
      <BranchContext.Provider value={{ branchId, setBranchId }}>
        <IdleLogoutGuard timeoutMinutes={idleTimeoutMinutes} />
        {/* h-full flex column: header sizes itself, the row below it takes
            whatever's left. No more fixed-position elements assuming the
            header is exactly touch-target-min tall — if the header ever
            grows (text wrap, icon-font swap, a long branch name), the
            sidebar and main both adjust automatically instead of going
            stale and visually overlapping/clipping. */}
        <div className="h-full flex flex-col">
          <header className="shrink-0 z-40 flex items-center justify-between gap-3 px-gutter min-h-touch-target-min bg-surface border-b border-outline-variant">
            {canSwitchBranch && currentBranchName && (
              <span className="text-label-vi font-bold text-on-surface px-1 truncate min-w-0">{currentBranchName}</span>
            )}

            <div className="flex items-center gap-3 ml-auto shrink-0">
              <ChatTrigger role={role} branchId={branchId} />
              <AccountMenu
                fullName={fullName}
                role={role}
                branchId={canSwitchBranch ? branchId : undefined}
                onBranchChange={canSwitchBranch ? setBranchId : undefined}
              />
            </div>
          </header>

          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar (tablet+) */}
            <aside className="hidden md:flex flex-col w-64 shrink-0 bg-surface-container-low border-r border-outline-variant overflow-y-auto z-30">
              <SidebarNav role={role} readyCount={readyCount} />
            </aside>

            {/* Main content — scrolls internally so the native scrollbar is
                scoped to this region, not the whole page. */}
            <main className="flex-1 overflow-y-auto p-margin-mobile md:p-margin-tablet lg:p-margin-desktop pb-[var(--bottom-nav-height)] md:pb-margin-desktop">
              {children}
            </main>
          </div>
        </div>

        {/* Mobile bottom nav */}
        <BottomNav role={role} readyCount={readyCount} />
      </BranchContext.Provider>
    </LanguageProvider>
  )
}
