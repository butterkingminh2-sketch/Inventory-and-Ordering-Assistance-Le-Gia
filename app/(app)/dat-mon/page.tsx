'use client'

import { useEffect, useState, useContext } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DishCard } from '@/components/dish-card'
import { ToppingPanel } from '@/components/topping-panel'
import { BranchContext } from '../app-shell'
import { getDishStatus, getMaxOrderableQty } from '@/lib/dish-availability'
import { sortToppingsByRelevance } from '@/lib/topping-relevance'
import { calculateDecrements, applyStockChange } from '@/lib/stock'
import { groupTablesByFloor } from '@/lib/tables'
import { aggregateQuantities } from '@/lib/order-lines'
import type { OrderLine } from '@/lib/order-lines'
import { num } from '@/lib/types'
import type { Dish, Item, RecipeLine, Table } from '@/lib/types'

type Step = 'table' | 'dishes' | 'review'

export default function DatMonPage() {
  const { branchId } = useContext(BranchContext)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [tables, setTables]           = useState<Table[]>([])
  const [dishes, setDishes]           = useState<Dish[]>([])
  const [items, setItems]             = useState<Item[]>([])
  const [recipes, setRecipes]         = useState<RecipeLine[]>([])
  const [selectedTable, setSelectedTable]   = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [lines, setLines]             = useState<OrderLine[]>([])
  const [panelDish, setPanelDish]     = useState<Dish | null>(null)
  const [step, setStep]               = useState<Step>('table')
  const [submitting, setSubmitting]   = useState(false)
  const [toast, setToast]             = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [t, d, i, r] = await Promise.all([
        supabase.from('tables').select('*').eq('branch_id', branchId).eq('is_active', true).order('label'),
        supabase.from('dishes').select('*').eq('branch_id', branchId).eq('is_active', true).order('name_vi'),
        supabase.from('items').select('*').eq('branch_id', branchId).eq('is_active', true),
        supabase.from('recipe_lines').select('*'),
      ])
      if (t.data) {
        setTables(t.data)

        const tableParam = searchParams.get('table')
        if (tableParam && t.data.some(tbl => tbl.id === tableParam)) {
          setSelectedTable(tableParam)
          setStep('dishes')
          // Clean the one-time navigation param out of the URL so a later
          // refresh or back/forward navigation doesn't re-trigger the jump.
          router.replace('/dat-mon')
        }
      }
      if (d.data) setDishes(d.data)
      if (i.data) setItems(i.data)
      if (r.data) setRecipes(r.data)
    }
    load()
  }, [branchId])

  const { takeout: takeoutTable, floors: floorGroups } = groupTablesByFloor(tables)

  // selectedCategory never auto-selects away from null ("Tất cả") — an
  // uncategorized dish must never become invisible just because other
  // categories exist.
  const categories = [...new Set(dishes.map(d => d.category).filter((c): c is string => c !== null))]
  const visibleDishes = selectedCategory === null
    ? dishes
    : dishes.filter(d => d.category === selectedCategory)

  // Toppings are scoped to the base dish's own menu section — e.g. a Lẩu
  // hotpot add-on must never show up on a Bún riêu bowl just because they
  // happen to share an ingredient like Riêu cua. Add an entry here whenever
  // a new "Đồ gọi thêm ___" category is introduced for another section.
  const TOPPING_CATEGORY_FOR: Record<string, string> = {
    'Bún riêu': 'Đồ gọi thêm',
    'Lẩu': 'Đồ gọi thêm lẩu',
  }

  const toppingDishes = panelDish
    ? dishes.filter(d => d.is_topping && d.category === TOPPING_CATEGORY_FOR[panelDish.category ?? ''])
    : []
  const panelToppings = panelDish
    ? sortToppingsByRelevance(panelDish, toppingDishes.filter(d => d.id !== panelDish.id), recipes)
    : []

  // Stock consumption per dish across the whole cart — own lines plus any
  // toppings attached to other lines, since a topping draws from the same
  // ingredient pool as ordering it standalone would.
  const stockQuantities = aggregateQuantities(lines)
  const totalLineCount = Object.values(stockQuantities).reduce((sum, qty) => sum + qty, 0)

  function removeLine(dishId: string) {
    setLines(prev => {
      const idx = prev.map(l => l.dishId).lastIndexOf(dishId)
      if (idx === -1) return prev
      return prev.filter((_, i) => i !== idx)
    })
  }

  function handleCardTap(dish: Dish) {
    const status = getDishStatus(dish.id, recipes, items)

    if (status === 'unavailable') {
      if (window.confirm('Món này hiện không đủ nguyên liệu. Vẫn muốn đặt?')) {
        setPanelDish(dish)
      }
      return
    }

    const maxQty = getMaxOrderableQty(dish.id, recipes, items, stockQuantities)
    const currentQty = stockQuantities[dish.id] ?? 0
    if (currentQty >= maxQty) return

    setPanelDish(dish)
  }

  function handlePanelConfirm({ toppingQuantities, note }: { toppingQuantities: Record<string, number>; note: string }) {
    if (!panelDish) return

    const newLine: OrderLine = {
      id: crypto.randomUUID(),
      dishId: panelDish.id,
      toppings: Object.fromEntries(Object.entries(toppingQuantities).filter(([, qty]) => qty > 0)),
      note: note.trim(),
    }

    setLines(prev => [...prev, newLine])
    setPanelDish(null)
  }

  function handlePanelClose() {
    setPanelDish(null)
  }

  async function handleSubmit() {
    if (!selectedTable || lines.length === 0) return
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({ branch_id: branchId, table_id: selectedTable, status: 'pending', created_by: user.id })
      .select('id')
      .single()

    if (orderError || !order) { setSubmitting(false); return }

    // Each line's dish row must be inserted (and its id known) before its
    // toppings can be linked to it via parent_item_id — sequential per line.
    for (const line of lines) {
      const dish = dishes.find(d => d.id === line.dishId)!
      const { data: dishItem } = await supabase
        .from('order_items')
        .insert({
          order_id: order.id,
          dish_id: line.dishId,
          qty: 1,
          price_at_order: num(dish.price),
          note: line.note || null,
        })
        .select('id')
        .single()

      if (!dishItem) continue

      const toppingRows = Object.entries(line.toppings)
        .filter(([, qty]) => qty > 0)
        .map(([toppingId, qty]) => {
          const topping = dishes.find(d => d.id === toppingId)!
          return {
            order_id: order.id,
            dish_id: toppingId,
            qty,
            price_at_order: num(topping.price),
            note: null,
            parent_item_id: dishItem.id,
          }
        })

      if (toppingRows.length > 0) {
        await supabase.from('order_items').insert(toppingRows)
      }
    }

    const orderQtyEntries = Object.entries(stockQuantities).map(([dish_id, qty]) => ({ dish_id, qty }))
    const decrements = calculateDecrements(orderQtyEntries, recipes)
    const { floored } = await applyStockChange(decrements, 'order', user.id, order.id)

    setSubmitting(false)
    setLines([])
    setSelectedTable(null)
    setStep('table')

    if (floored.length > 0) {
      setToast('Kho không đủ — đã cập nhật về 0')
      setTimeout(() => setToast(null), 4000)
    }

    router.push('/kho')
  }

  return (
    <div className="max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-error text-on-error text-label-vi font-bold px-stack-lg py-2 rounded-xl z-50 shadow-lg">
          {toast}
        </div>
      )}

      {panelDish && (
        <ToppingPanel
          dish={panelDish}
          toppings={panelToppings}
          initialNote=""
          onConfirm={handlePanelConfirm}
          onClose={handlePanelClose}
        />
      )}

      {step === 'table' && (
        <>
          <h2 className="text-headline-md font-bold text-on-surface mb-stack-lg">
            Chọn bàn
            <span className="block text-label-en font-normal text-on-surface-variant">Select table</span>
          </h2>

          {takeoutTable && (
            <button
              onClick={() => { setSelectedTable(takeoutTable.id); setStep('dishes') }}
              className="w-full min-h-touch-target-min mb-stack-lg rounded-xl bg-primary text-on-primary font-bold text-label-vi shadow-md hover:bg-primary-container transition-all"
            >
              {takeoutTable.label}
            </button>
          )}

          {floorGroups.map(group => (
            <div key={group.floor} className="mb-stack-lg">
              <p className="text-label-en font-bold text-on-surface-variant uppercase mb-2">Tầng {group.floor}</p>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {group.tables.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTable(t.id); setStep('dishes') }}
                    className="min-h-touch-target-min rounded-xl border-2 border-outline-variant bg-surface-container-lowest font-bold text-label-vi text-on-surface hover:border-primary hover:bg-primary-fixed transition-all"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {step === 'dishes' && (
        <div inert={panelDish !== null}>
          <div className="flex items-center gap-3 mb-stack-lg">
            <button onClick={() => setStep('table')} className="text-primary text-label-vi font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]" aria-hidden>arrow_back</span>
              Bàn
            </button>
            <h2 className="text-headline-md font-bold text-on-surface">Chọn món</h2>
          </div>

          {categories.length > 0 && (
            <div className="flex gap-2 mb-stack-lg overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-4 rounded-full text-label-vi font-bold whitespace-nowrap min-h-touch-target-min transition-colors ${
                  selectedCategory === null
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                Tất cả
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

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-24">
            {visibleDishes.map(dish => {
              const status = getDishStatus(dish.id, recipes, items)
              const ownQty = lines.filter(l => l.dishId === dish.id).length
              const stockQty = stockQuantities[dish.id] ?? 0
              const maxQty = getMaxOrderableQty(dish.id, recipes, items, stockQuantities)
              const atMax = status !== 'unavailable' && stockQty >= maxQty
              return (
                <DishCard
                  key={dish.id}
                  dish={dish}
                  status={status}
                  qty={ownQty}
                  atMax={atMax}
                  onCardTap={() => handleCardTap(dish)}
                  onRemove={() => removeLine(dish.id)}
                />
              )
            })}
          </div>

          {lines.length > 0 && (
            <div className="fixed bottom-touch-target-min md:bottom-0 left-0 right-0 p-gutter bg-surface border-t border-outline-variant">
              <button
                onClick={() => setStep('review')}
                className="w-full bg-primary text-on-primary rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min shadow-md"
              >
                Xem lại đơn ({totalLineCount} món)
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'review' && (
        <>
          <div className="flex items-center gap-3 mb-stack-lg">
            <button onClick={() => setStep('dishes')} className="text-primary text-label-vi font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]" aria-hidden>arrow_back</span>
              Món
            </button>
            <h2 className="text-headline-md font-bold text-on-surface">Xác nhận đặt món</h2>
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg mb-stack-lg space-y-2">
            <p className="text-label-en text-on-surface-variant">
              Bàn: <span className="font-bold text-on-surface">{tables.find(t => t.id === selectedTable)?.label}</span>
            </p>
            {lines.map(line => {
              const dish = dishes.find(d => d.id === line.dishId)!
              const toppingEntries = Object.entries(line.toppings).filter(([, qty]) => qty > 0)
              return (
                <div key={line.id} className="flex justify-between items-start">
                  <div>
                    <span className="text-label-vi font-bold text-on-surface">{dish.name_vi}</span>
                    {toppingEntries.map(([toppingId, qty]) => {
                      const topping = dishes.find(d => d.id === toppingId)
                      return (
                        <span key={toppingId} className="block text-label-en text-on-surface-variant">
                          {topping?.name_vi}{qty > 1 ? ` ×${qty}` : ''}
                        </span>
                      )
                    })}
                    {line.note && (
                      <span className="block text-label-en text-on-surface-variant">{line.note}</span>
                    )}
                  </div>
                  <span className="text-label-vi font-black text-primary">×1</span>
                </div>
              )
            })}
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-primary text-on-primary rounded-xl py-3 text-label-vi font-bold disabled:opacity-50 min-h-touch-target-min shadow-md"
          >
            {submitting ? 'Đang đặt…' : 'Xác nhận đặt món'}
          </button>
        </>
      )}
    </div>
  )
}
