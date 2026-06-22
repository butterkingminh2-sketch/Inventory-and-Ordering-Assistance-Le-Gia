'use client'

import { useState } from 'react'
import { getMaxOrderableQty } from '@/lib/dish-availability'
import { num } from '@/lib/types'
import type { Dish, Item, RecipeLine } from '@/lib/types'

interface ConfirmResult {
  toppingQuantities: Record<string, number>
  note: string
}

interface Props {
  dish: Dish
  toppings: Dish[]
  initialNote: string
  recipes: RecipeLine[]
  items: Item[]
  /** Quantities already committed elsewhere in the cart (excludes this panel's own in-progress selections). */
  cartQuantities: Record<string, number>
  onConfirm: (result: ConfirmResult) => void
  onClose: () => void
}

export function ToppingPanel({ dish, toppings, initialNote, recipes, items, cartQuantities, onConfirm, onClose }: Props) {
  const [closing, setClosing] = useState(false)
  const [toppingQuantities, setToppingQuantities] = useState<Record<string, number>>({})
  const [note, setNote] = useState(initialNote)

  // Merges this panel's in-progress topping picks on top of what the rest of
  // the cart already committed, so the cap check sees the true combined
  // draw on any ingredient shared between toppings (or with other dishes).
  const combinedQuantities: Record<string, number> = { ...cartQuantities }
  for (const [id, qty] of Object.entries(toppingQuantities)) {
    combinedQuantities[id] = (combinedQuantities[id] ?? 0) + qty
  }

  function adjustTopping(toppingId: string, delta: 1 | -1) {
    if (delta === 1) {
      const maxQty = getMaxOrderableQty(toppingId, recipes, items, combinedQuantities)
      const currentQty = combinedQuantities[toppingId] ?? 0
      if (currentQty >= maxQty) return
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
    setTimeout(() => onConfirm({ toppingQuantities, note }), 250)
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

        {toppings.length > 0 && (
          <ul className="divide-y divide-outline-variant mb-stack-lg">
            {toppings.map(topping => {
              const qty = toppingQuantities[topping.id] ?? 0
              const maxQty = getMaxOrderableQty(topping.id, recipes, items, combinedQuantities)
              const atMax = (combinedQuantities[topping.id] ?? 0) >= maxQty
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
