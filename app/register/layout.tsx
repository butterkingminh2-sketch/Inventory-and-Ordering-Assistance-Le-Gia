import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AccountMenu } from '@/components/account-menu'

export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'register' && profile.role !== 'manager')) {
    redirect('/kho')
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 px-gutter min-h-touch-target-min bg-surface border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
            point_of_sale
          </span>
          <span className="font-bold text-on-surface">Thu ngân</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
            chat
          </span>
          <AccountMenu fullName={profile.full_name} role={profile.role} />
        </div>
      </header>
      <main className="flex-1 p-margin-mobile md:p-margin-tablet">{children}</main>
    </div>
  )
}
