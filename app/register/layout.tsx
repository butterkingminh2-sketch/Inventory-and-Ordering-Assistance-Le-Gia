import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AccountMenu } from '@/components/account-menu'
import { ChatTrigger } from '@/components/chat-trigger'
import { IdleLogoutGuard } from '@/components/idle-logout-guard'

export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name, branch_id')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'register' && profile.role !== 'manager')) {
    redirect('/kho')
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <IdleLogoutGuard timeoutMinutes={profile.role === 'manager' ? 5 : 10} />
      <header className="flex items-center justify-between gap-3 px-gutter min-h-touch-target-min bg-surface border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
            point_of_sale
          </span>
          <span className="font-bold text-on-surface">Thu ngân</span>
        </div>

        <div className="flex items-center gap-3">
          <ChatTrigger role={profile.role} branchId={profile.branch_id} />
          <AccountMenu fullName={profile.full_name} role={profile.role} />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto p-margin-mobile md:p-margin-tablet">{children}</main>
    </div>
  )
}
