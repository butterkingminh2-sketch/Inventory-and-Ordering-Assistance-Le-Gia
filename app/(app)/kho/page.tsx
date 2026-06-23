'use client'

import { useEffect, useRef, useState, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IngredientCard } from '@/components/ingredient-card'
import { applyStockChange } from '@/lib/stock'
import { sortBySeverity } from '@/lib/stock-sort'
import { matchesNameSearch } from '@/lib/dish-search'
import { BranchContext } from '../app-shell'
import { num } from '@/lib/types'
import type { Item } from '@/lib/types'
import { useLanguage } from '@/lib/language-context'

export default function KhoPage() {
  const { branchId } = useContext(BranchContext)
  const { t } = useLanguage()
  const [items, setItems] = useState<Item[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [sortToTop, setSortToTop] = useState(false)
  const [justSorted, setJustSorted] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
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

  const categories = [...new Set(items.map(i => i.category).filter((c): c is string => c !== null))]
  const isSearching = searchQuery.trim().length > 0
  // While searching, ignore the category filter entirely, same as Đặt món's
  // dish search — the point is finding something fast without first
  // picking the right category.
  const categoryFiltered = selectedCategory === null
    ? items
    : items.filter(i => i.category === selectedCategory)
  const filteredItems = isSearching
    ? items.filter(i => matchesNameSearch(i, searchQuery))
    : categoryFiltered
  const displayItems = sortToTop ? sortBySeverity(filteredItems) : filteredItems

  function handleBarClick() {
    // The bar's count is across the whole inventory — clear any active
    // filter/search first, or the sorted view could hide the very items
    // it's pointing at.
    setSelectedCategory(null)
    setSearchQuery('')
    setSortToTop(true)
    setJustSorted(true)
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => setJustSorted(false), 1200)
  }

  return (
    <>
      {lastUpdated && (
        <p className="text-label-en text-on-surface-variant mb-stack-lg">
          {t('Cập nhật lúc', 'Updated at')}{' '}
          {lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      <div className="relative mb-stack-lg">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant" aria-hidden>
          search
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t('Tìm nguyên liệu...', 'Search ingredients...')}
          aria-label={t('Tìm nguyên liệu', 'Search ingredients')}
          className="w-full min-h-touch-target-min pl-10 pr-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-label-vi text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {!isSearching && categories.length > 0 && (
        <div className="flex gap-2 mb-stack-lg overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-4 rounded-full text-label-vi font-bold whitespace-nowrap min-h-touch-target-min transition-colors ${
              selectedCategory === null
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {t('Tất cả', 'All')}
          </button>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setSelectedCategory(c)}
              className={`px-4 rounded-full text-label-vi font-bold whitespace-nowrap min-h-touch-target-min transition-colors ${
                selectedCategory === c
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {isSearching && displayItems.length === 0 && (
        <p className="text-on-surface-variant text-center mt-8 text-label-vi">
          {t('Không tìm thấy nguyên liệu nào', 'No ingredients found')}
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
          className="fixed bottom-[var(--bottom-nav-height)] md:bottom-0 left-0 right-0 z-50 bg-error-container text-on-error-container px-margin-tablet py-3 shadow-lg flex justify-between items-center animate-pulse hover:bg-error-container/90 active:scale-[0.99] transition-all"
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden>warning</span>
          <span className="text-label-vi font-bold">
            {outCount > 0 && `${outCount} ${t('hết', 'out')}`}
            {outCount > 0 && lowCount > 0 && ' · '}
            {lowCount > 0 && `${lowCount} ${t('sắp hết', 'low')}`}
          </span>
          <span className="text-label-en flex items-center gap-1">
            {t(`${problemItems.length} nguyên liệu cần chú ý`, `${problemItems.length} ingredients need attention`)}
            <span className="material-symbols-outlined text-[18px]" aria-hidden>arrow_upward</span>
          </span>
        </button>
      )}
    </>
  )
}
