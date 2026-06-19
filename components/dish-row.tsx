'use client'

import type { Dish } from '@/lib/types'
import type { DishStatus } from '@/lib/dish-availability'

interface Props {
  dish: Dish
  status: DishStatus
  qty: number
  onAdd: () => void
  onRemove: () => void
}

export function DishRow({ dish, status, qty, onAdd, onRemove }: Props) {
  const unavailable = status === 'unavailable'

  return (
    <div className={`flex items-center gap-3 py-3 border-b border-outline-variant last:border-0 ${unavailable ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-label-vi font-bold text-on-surface">{dish.name_vi}</p>
        {dish.name_en && (
          <p className="text-label-en text-on-surface-variant">{dish.name_en}</p>
        )}
        {status === 'low' && (
          <p className="text-label-en font-bold text-tertiary mt-0.5">Sắp hết nguyên liệu</p>
        )}
        {status === 'unavailable' && (
          <p className="text-label-en font-bold text-error mt-0.5">Hết nguyên liệu</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {qty > 0 && (
          <button
            onClick={onRemove}
            className="w-touch-target-min h-touch-target-min rounded-lg border border-outline-variant bg-surface-container-high text-primary text-xl font-bold flex items-center justify-center"
            aria-label={`Giảm ${dish.name_vi}`}
          >
            −
          </button>
        )}
        {qty > 0 && (
          <span className="w-7 text-center font-bold text-[18px] text-on-surface">{qty}</span>
        )}
        <button
          onClick={onAdd}
          className="w-touch-target-min h-touch-target-min rounded-lg bg-primary text-on-primary shadow-md text-xl font-bold flex items-center justify-center"
          aria-label={`Thêm ${dish.name_vi}`}
        >
          +
        </button>
      </div>
    </div>
  )
}
