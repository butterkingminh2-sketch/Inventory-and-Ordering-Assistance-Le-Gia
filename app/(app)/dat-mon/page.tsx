'use client'

import { useEffect, useState, useContext } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DishRow } from '@/components/dish-row'
import { BranchContext } from '../app-shell'
import { getDishStatus } from '@/lib/dish-availability'
import { calculateDecrements, applyStockChange } from '@/lib/stock'
import type { Dish, Item, RecipeLine, Table } from '@/lib/types'

type Step = 'table' | 'dishes' | 'review'

export default function DatMonPage() {
  const { branchId } = useContext(BranchContext)
  const router = useRouter()
  const supabase = createClient()

  const [tables, setTables]   = useState<Table[]>([])
  const [dishes, setDishes]   = useState<Dish[]>([])
  const [items, setItems]     = useState<Item[]>([])
  const [recipes, setRecipes] = useState<RecipeLine[]>([])
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [step, setStep]       = useState<Step>('table')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast]     = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [t, d, i, r] = await Promise.all([
        supabase.from('tables').select('*').eq('branch_id', branchId).eq('is_active', true).order('label'),
        supabase.from('dishes').select('*').eq('branch_id', branchId).eq('is_active', true).order('name_vi'),
        supabase.from('items').select('*').eq('branch_id', branchId).eq('is_active', true),
        supabase.from('recipe_lines').select('*'),
      ])
      if (t.data) setTables(t.data)
      if (d.data) setDishes(d.data)
      if (i.data) setItems(i.data)
      if (r.data) setRecipes(r.data)
    }
    load()
  }, [branchId])

  function adjustQty(dishId: string, delta: 1 | -1) {
    setQuantities(prev => ({
      ...prev,
      [dishId]: Math.max(0, (prev[dishId] ?? 0) + delta),
    }))
  }

  function handleAddUnavailable(dishId: string) {
    if (window.confirm('Món này hiện không đủ nguyên liệu. Vẫn muốn đặt?')) {
      adjustQty(dishId, 1)
    }
  }

  const orderLines = Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([dish_id, qty]) => ({ dish_id, qty }))

  async function handleSubmit() {
    if (!selectedTable || orderLines.length === 0) return
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({ branch_id: branchId, table_id: selectedTable, status: 'pending', created_by: user.id })
      .select('id')
      .single()

    if (orderError || !order) { setSubmitting(false); return }

    await supabase.from('order_items').insert(
      orderLines.map(l => ({ order_id: order.id, dish_id: l.dish_id, qty: l.qty }))
    )

    const decrements = calculateDecrements(orderLines, recipes)
    const { floored } = await applyStockChange(decrements, 'order', user.id)

    setSubmitting(false)
    setQuantities({})
    setSelectedTable(null)
    setStep('table')

    if (floored.length > 0) {
      setToast('Kho không đủ — đã cập nhật về 0')
      setTimeout(() => setToast(null), 4000)
    }

    router.push('/kho')
  }

  return (
    <div className="max-w-lg mx-auto">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-error text-on-error text-label-vi font-bold px-stack-lg py-2 rounded-xl z-50 shadow-lg">
          {toast}
        </div>
      )}

      {step === 'table' && (
        <>
          <h2 className="text-headline-md font-bold text-on-surface mb-stack-lg">
            Chọn bàn
            <span className="block text-label-en font-normal text-on-surface-variant">Select table</span>
          </h2>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {tables.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelectedTable(t.id); setStep('dishes') }}
                className="min-h-touch-target-min rounded-xl border-2 border-outline-variant bg-surface-container-lowest font-bold text-label-vi text-on-surface hover:border-primary hover:bg-primary-fixed transition-all"
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'dishes' && (
        <>
          <div className="flex items-center gap-3 mb-stack-lg">
            <button onClick={() => setStep('table')} className="text-primary text-label-vi font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]" aria-hidden>arrow_back</span>
              Bàn
            </button>
            <h2 className="text-headline-md font-bold text-on-surface">Chọn món</h2>
          </div>

          <div className="divide-y divide-outline-variant">
            {dishes.map(dish => {
              const status = getDishStatus(dish.id, recipes, items)
              const qty = quantities[dish.id] ?? 0
              return (
                <DishRow
                  key={dish.id}
                  dish={dish}
                  status={status}
                  qty={qty}
                  onAdd={() => status === 'unavailable' ? handleAddUnavailable(dish.id) : adjustQty(dish.id, 1)}
                  onRemove={() => adjustQty(dish.id, -1)}
                />
              )
            })}
          </div>

          {orderLines.length > 0 && (
            <div className="fixed bottom-touch-target-min md:bottom-0 left-0 right-0 p-gutter bg-surface border-t border-outline-variant">
              <button
                onClick={() => setStep('review')}
                className="w-full bg-primary text-on-primary rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min shadow-md"
              >
                Xem lại đơn ({orderLines.reduce((s, l) => s + l.qty, 0)} món)
              </button>
            </div>
          )}
        </>
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
            {orderLines.map(l => {
              const dish = dishes.find(d => d.id === l.dish_id)!
              return (
                <div key={l.dish_id} className="flex justify-between items-center">
                  <span className="text-label-vi font-bold text-on-surface">{dish.name_vi}</span>
                  <span className="text-label-vi font-black text-primary">×{l.qty}</span>
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
