import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'register' && profile.role !== 'manager')) {
    redirect('/kho')
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 flex items-center gap-3 px-gutter min-h-touch-target-min bg-surface border-b border-outline-variant">
        <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
          point_of_sale
        </span>
        <span className="font-bold text-on-surface">Thu ngân</span>
      </header>
      <main className="flex-1 p-margin-mobile md:p-margin-tablet">{children}</main>
    </div>
  )
}
