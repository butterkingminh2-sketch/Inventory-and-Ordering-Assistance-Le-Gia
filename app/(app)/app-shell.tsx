'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SidebarNav } from '@/components/sidebar-nav'
import { BottomNav } from '@/components/bottom-nav'
import { AccountMenu } from '@/components/account-menu'
import { ChatTrigger } from '@/components/chat-trigger'
import type { Branch, UserRole } from '@/lib/types'

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
  children: React.ReactNode
}

export function AppShell({ role, defaultBranchId, fullName, children }: Props) {
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

  return (
    <BranchContext.Provider value={{ branchId, setBranchId }}>
      {/* Top header */}
      <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-gutter min-h-touch-target-min bg-surface border-b border-outline-variant">
        {canSwitchBranch && currentBranchName && (
          <span className="text-label-vi font-bold text-on-surface px-1">{currentBranchName}</span>
        )}

        <div className="flex items-center gap-3 ml-auto">
          <ChatTrigger role={role} branchId={branchId} />
          <AccountMenu
            fullName={fullName}
            role={role}
            branchId={canSwitchBranch ? branchId : undefined}
            onBranchChange={canSwitchBranch ? setBranchId : undefined}
          />
        </div>
      </header>

      {/* Sidebar (tablet+) */}
      <aside className="hidden md:flex flex-col fixed left-0 top-touch-target-min bottom-0 w-64 bg-surface-container-low border-r border-outline-variant overflow-y-auto z-30">
        <SidebarNav role={role} readyCount={readyCount} />
      </aside>

      {/* Main content */}
      <main className="mt-touch-target-min md:ml-64 p-margin-mobile md:p-margin-tablet lg:p-margin-desktop pb-touch-target-min md:pb-0">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <BottomNav role={role} readyCount={readyCount} />
    </BranchContext.Provider>
  )
}
