'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/lib/language-context'
import { createClient } from '@/lib/supabase/client'
import type { Branch } from '@/lib/types'

interface Props {
  branchId: string
  onBranchChange: (id: string) => void
}

export function BranchSelector({ branchId, onBranchChange }: Props) {
  const { t } = useLanguage()
  const [branches, setBranches] = useState<Branch[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      if (data) setBranches(data)
    })
  }, [])

  if (branches.length <= 1) return null

  return (
    <select
      value={branchId}
      onChange={e => onBranchChange(e.target.value)}
      className="text-label-vi font-bold bg-transparent border-none outline-none cursor-pointer min-h-touch-target-min px-1 text-on-surface"
      aria-label={t('Chọn chi nhánh', 'Select branch')}
    >
      {branches.map(b => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  )
}
