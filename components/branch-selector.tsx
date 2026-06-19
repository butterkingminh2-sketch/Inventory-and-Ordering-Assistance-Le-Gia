'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Branch } from '@/lib/types'

interface Props {
  branchId: string
  onBranchChange: (id: string) => void
}

export function BranchSelector({ branchId, onBranchChange }: Props) {
  const [branches, setBranches] = useState<Branch[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      if (data) setBranches(data)
    })
  }, [])

  if (branches.length === 0) return null

  return (
    <select
      value={branchId}
      onChange={e => onBranchChange(e.target.value)}
      className="text-label-vi font-bold bg-transparent border-none outline-none cursor-pointer min-h-touch-target-min px-1 text-on-surface"
      aria-label="Chọn chi nhánh"
    >
      {branches.map(b => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  )
}
