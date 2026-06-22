'use client'

import { useState } from 'react'
import { getMaxOrderableQty } from '@/lib/dish-availability'
import { num } from '@/lib/types'
import type { Dish, Item, RecipeLine } from '@/lib/types'

interface ConfirmResult {
  toppingQuantities: Record<string, number>
  note: string
  quantity: number
}

interface Props {
  dish: Dish
  toppings: Dish[]
  initialNote: string
  recipes: RecipeLine[]
  items: Item[]
  /** Quantities already committed elsewhere in the cart (excludes this panel's own in-progress selections). */
  cartQuantities: Record<string, number>
  /** Max servings of `dish` addable right now — Infinity (or a generous cap) when the unavailable-override path was taken. */
  maxQuantity: number
  onConfirm: (result: ConfirmResult) => void
  onClose: () => void
}

export function ToppingPanel({ dish, toppings, initialNote, recipes, items, cartQuantities, maxQuantity, onConfirm, onClose }: Props) {
  const [closing, setClosing] = useState(false)
  const [toppingQuantities, setToppingQuantities] = useState<Record<string, number>>({})
  const [note, setNote] = useState(initialNote)
  const [quantity, setQuantity] = useState(1)
  const [editingQuantity, setEditingQuantity] = useState(false)
  const [quantityText, setQuantityText] = useState('1')

  function commitQuantityText() {
    const parsed = parseInt(quantityText, 10)
    const clamped = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), maxQuantity) : quantity
    setQuantity(clamped)
    setQuantityText(String(clamped))
    setEditingQuantity(false)
  }

  // Merges this panel's in-progress topping picks on top of what the rest of
  // the cart already committed, so the cap check sees the true combined
  // draw on any ingredient shared between toppings (or with other dishes).
  // Multiplied by quantity since confirming creates that many identical
  // servings, each drawing the same toppings again.
  const combinedQuantities: Record<string, number> = { ...cartQuantities }
  for (const [id, qty] of Object.entries(toppingQuantities)) {
    combinedQuantities[id] = (combinedQuantities[id] ?? 0) + qty * quantity
  }

  function adjustTopping(toppingId: string, delta: 1 | -1) {
    if (delta === 1) {
      const maxQty = getMaxOrderableQty(toppingId, recipes, items, combinedQuantities)
      const projectedTotal = ((toppingQuantities[toppingId] ?? 0) + 1) * quantity
      if (projectedTotal > maxQty) return
    }
    setToppingQuantities(prev => ({
      ...prev,
      [toppingId]: Math.max(0, (prev[toppingId] ?? 0) + delta),
    }))
  }

  function handleClose() {
    setClosing(true)
    setTimeout(onClose, 250)
  }

  function handleConfirm() {
    setClosing(true)
    setTimeout(() => onConfirm({ toppingQuantities, note, quantity }), 250)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className={`absolute inset-0 bg-black/40 ${closing ? 'animate-fade-out' : 'animate-fade-in'}`}
        onClick={handleClose}
      />
      <div
        className={`relative w-full max-w-sm bg-surface h-full overflow-y-auto p-stack-lg shadow-lg ${
          closing ? 'animate-slide-out-right' : 'animate-slide-in-right'
        }`}
      >
        <h3 className="text-headline-md font-bold text-on-surface mb-1">{dish.name_vi}</h3>
        <p className="text-label-en text-on-surface-variant mb-stack-lg">Thêm món / Ghi chú</p>

        <div className="flex items-center justify-between mb-stack-lg rounded-xl border border-outline-variant p-stack-md">
          <span className="text-label-vi font-bold text-on-surface">Số lượng</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="w-touch-target-min h-touch-target-min rounded-lg border border-outline-variant text-primary text-xl font-bold flex items-center justify-center disabled:opacity-40"
              aria-label="Giảm số lượng"
            >
              −
            </button>
            {editingQuantity ? (
              <input
                type="number"
                inputMode="numeric"
                autoFocus
                value={quantityText}
                onChange={e => setQuantityText(e.target.value)}
                onBlur={commitQuantityText}
                onKeyDown={e => { if (e.key === 'Enter') commitQuantityText() }}
                className="w-14 text-center font-black text-[20px] text-on-surface border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
              />
            ) : (
              <button
                onClick={() => { setQuantityText(String(quantity)); setEditingQuantity(true) }}
                aria-label="Nhập số lượng"
                className="w-14 text-center font-black text-[20px] text-on-surface border-b-2 border-dashed border-current"
              >
                {quantity}
              </button>
            )}
            <button
              onClick={() => setQuantity(q => Math.min(maxQuantity, q + 1))}
              disabled={quantity >= maxQuantity}
              className="w-touch-target-min h-touch-target-min rounded-lg bg-primary text-on-primary text-xl font-bold flex items-center justify-center disabled:opacity-40"
              aria-label="Tăng số lượng"
            >
              +
            </button>
          </div>
        </div>

        {toppings.length > 0 && (
          <ul className="divide-y divide-outline-variant mb-stack-lg">
            {toppings.map(topping => {
              const qty = toppingQuantities[topping.id] ?? 0
              const maxQty = getMaxOrderableQty(topping.id, recipes, items, combinedQuantities)
              const atMax = (qty + 1) * quantity > maxQty
              return (
                <li key={topping.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-label-vi font-bold text-on-surface truncate">{topping.name_vi}</p>
                    <p className="text-label-en text-on-surface-variant">{num(topping.price).toLocaleString('vi-VN')}đ</p>
                    {atMax && (
                      <p className="text-label-en font-bold text-tertiary">Đã đạt giới hạn kho</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {qty > 0 && (
                      <>
                        <button
                          onClick={() => adjustTopping(topping.id, -1)}
                          className="w-touch-target-min h-touch-target-min rounded-lg border border-outline-variant text-primary text-xl font-bold flex items-center justify-center"
                          aria-label={`Giảm ${topping.name_vi}`}
                        >
                          −
                        </button>
                        <span className="w-6 text-center font-bold text-on-surface">{qty}</span>
                      </>
                    )}
                    <button
                      onClick={() => adjustTopping(topping.id, 1)}
                      disabled={atMax}
                      className="w-touch-target-min h-touch-target-min rounded-lg bg-primary text-on-primary text-xl font-bold flex items-center justify-center disabled:opacity-40"
                      aria-label={`Thêm ${topping.name_vi}`}
                    >
                      +
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <label className="text-label-en text-on-surface-variant block mb-1">Ghi chú (VD: không đậu hũ)</label>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Nhập ghi chú..."
          className="w-full border border-outline-variant rounded-lg px-3 py-2 text-label-vi bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary min-h-touch-target-min mb-stack-lg"
        />

        <button
          onClick={handleConfirm}
          className="w-full bg-primary text-on-primary rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min shadow-md active:scale-95 transition-transform"
        >
          Xong
        </button>
      </div>
    </div>
  )
}
