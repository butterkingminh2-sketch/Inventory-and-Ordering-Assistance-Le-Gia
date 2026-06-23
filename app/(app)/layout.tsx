import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from './app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, branch_id, full_name, language')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (profile.role === 'kitchen') redirect('/kitchen')
  if (profile.role === 'register') redirect('/register')

  return (
    <AppShell
      role={profile.role}
      defaultBranchId={profile.branch_id}
      fullName={profile.full_name}
      language={profile.language}
      userId={user.id}
    >
      {children}
    </AppShell>
  )
}
