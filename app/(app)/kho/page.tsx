'use client'

import { useEffect, useState, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IngredientCard } from '@/components/ingredient-card'
import { applyStockChange } from '@/lib/stock'
import { BranchContext } from '../app-shell'
import { num } from '@/lib/types'
import type { Item } from '@/lib/types'

export default function KhoPage() {
  const { branchId } = useContext(BranchContext)
  const [items, setItems] = useState<Item[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('items')
        .select('*')
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .order('name_vi')
      if (data) { setItems(data); setLastUpdated(new Date()) }
    }
    load()

    const channel = supabase
      .channel(`items-${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `branch_id=eq.${branchId}` },
        payload => {
          setItems(prev => prev.map(i =>
            i.id === (payload.new as Item).id ? (payload.new as Item) : i
          ))
          setLastUpdated(new Date())
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [branchId])

  async function handleAdjust(itemId: string, delta: 1 | -1) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await applyStockChange([{ item_id: itemId, delta }], 'manual_correction', user.id)
  }

  const problemItems = items.filter(i => num(i.quantity) <= num(i.low_threshold))
  const outCount = items.filter(i => num(i.quantity) <= 0).length
  const lowCount = problemItems.length - outCount

  return (
    <>
      {lastUpdated && (
        <p className="text-label-en text-on-surface-variant mb-stack-lg">
          Cập nhật lúc{' '}
          {lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-stack-lg">
        {items.map(item => (
          <IngredientCard key={item.id} item={item} onAdjust={handleAdjust} />
        ))}
      </div>

      {problemItems.length > 0 && (
        <div className="fixed bottom-touch-target-min md:bottom-0 left-0 right-0 z-50 bg-error-container text-on-error-container px-margin-tablet py-3 shadow-lg flex justify-between items-center animate-pulse">
          <span className="material-symbols-outlined text-[20px]" aria-hidden>warning</span>
          <span className="text-label-vi font-bold">
            {outCount > 0 && `${outCount} hết`}
            {outCount > 0 && lowCount > 0 && ' · '}
            {lowCount > 0 && `${lowCount} sắp hết`}
          </span>
          <span className="text-label-en">{problemItems.length} nguyên liệu cần chú ý</span>
        </div>
      )}
    </>
  )
}
