'use client'

import { useEffect, useRef, useState, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IngredientCard } from '@/components/ingredient-card'
import { applyStockChange } from '@/lib/stock'
import { sortBySeverity } from '@/lib/stock-sort'
import { BranchContext } from '../app-shell'
import { num } from '@/lib/types'
import type { Item } from '@/lib/types'

export default function KhoPage() {
  const { branchId } = useContext(BranchContext)
  const [items, setItems] = useState<Item[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [sortToTop, setSortToTop] = useState(false)
  const [justSorted, setJustSorted] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const userIdRef = useRef<string | null>(null)
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

    // Fetched once per page load rather than on every +/- tap — auth.getUser()
    // always makes a network round-trip to revalidate the JWT, and re-paying
    // that cost on every tap was the actual source of the perceived lag, not
    // any missing index.
    supabase.auth.getUser().then(({ data: { user } }) => { userIdRef.current = user?.id ?? null })

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
    const userId = userIdRef.current
    if (!userId) return

    // Optimistic update, mirroring the RPC's own floor-at-zero clamp — the
    // realtime subscription reconciles this with the server value moments
    // later, but the tap shouldn't have to wait on that round-trip first.
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, quantity: Math.max(num(i.quantity) + delta, 0) } : i
    ))

    await applyStockChange([{ item_id: itemId, delta }], 'manual_correction', userId)
  }

  async function handleSetQuantity(itemId: string, newQuantity: number) {
    const userId = userIdRef.current
    if (!userId) return
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const delta = newQuantity - num(item.quantity)
    if (delta === 0) return

    setItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: newQuantity } : i))

    await applyStockChange([{ item_id: itemId, delta }], 'count', userId)
  }

  const problemItems = items.filter(i => num(i.quantity) <= num(i.low_threshold))
  const outCount = items.filter(i => num(i.quantity) <= 0).length
  const lowCount = problemItems.length - outCount
  const displayItems = sortToTop ? sortBySeverity(items) : items

  function handleBarClick() {
    setSortToTop(true)
    setJustSorted(true)
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => setJustSorted(false), 1200)
  }

  return (
    <>
      {lastUpdated && (
        <p className="text-label-en text-on-surface-variant mb-stack-lg">
          Cập nhật lúc{' '}
          {lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-stack-lg">
        {displayItems.map(item => {
          const isProblem = num(item.quantity) <= num(item.low_threshold)
          return (
            <div key={item.id} className={justSorted && isProblem ? 'rounded-xl animate-status-flash' : ''}>
              <IngredientCard item={item} onAdjust={handleAdjust} onSetQuantity={handleSetQuantity} />
            </div>
          )
        })}
      </div>

      {problemItems.length > 0 && (
        <button
          onClick={handleBarClick}
          className="fixed bottom-touch-target-min md:bottom-0 left-0 right-0 z-50 bg-error-container text-on-error-container px-margin-tablet py-3 shadow-lg flex justify-between items-center animate-pulse hover:bg-error-container/90 active:scale-[0.99] transition-all"
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden>warning</span>
          <span className="text-label-vi font-bold">
            {outCount > 0 && `${outCount} hết`}
            {outCount > 0 && lowCount > 0 && ' · '}
            {lowCount > 0 && `${lowCount} sắp hết`}
          </span>
          <span className="text-label-en flex items-center gap-1">
            {problemItems.length} nguyên liệu cần chú ý
            <span className="material-symbols-outlined text-[18px]" aria-hidden>arrow_upward</span>
          </span>
        </button>
      )}
    </>
  )
}
