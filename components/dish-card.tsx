'use client'

import { useState } from 'react'
import type { Dish } from '@/lib/types'
import type { DishStatus } from '@/lib/dish-availability'

interface Props {
  dish: Dish
  status: DishStatus
  qty: number
  atMax: boolean
  onAdd: () => void
  onRemove: () => void
}

export function DishCard({ dish, status, qty, atMax, onAdd, onRemove }: Props) {
  const unavailable = status === 'unavailable'
  const [imageError, setImageError] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAdd}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd() }
      }}
      aria-label={`Thêm ${dish.name_vi}`}
      className={`rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden cursor-pointer select-none active:scale-[0.98] transition-transform ${unavailable ? 'opacity-50' : ''}`}
    >
      <div className="aspect-[4/3] bg-surface-container-high flex items-center justify-center">
        {dish.image_url && !imageError ? (
          <img
            src={dish.image_url}
            alt={dish.name_vi}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="material-symbols-outlined text-[32px] text-on-surface-variant" aria-hidden>
            restaurant
          </span>
        )}
      </div>

      <div className="p-stack-md">
        <p className="text-label-vi font-bold text-on-surface truncate">{dish.name_vi}</p>
        {dish.name_en && (
          <p className="text-label-en text-on-surface-variant truncate">{dish.name_en}</p>
        )}

        <div className="flex items-center justify-between mt-2">
          <div className="flex-1 min-w-0">
            {status === 'low' && (
              <p className="text-label-en font-bold text-tertiary">Sắp hết nguyên liệu</p>
            )}
            {status === 'unavailable' && (
              <p className="text-label-en font-bold text-error">Hết nguyên liệu</p>
            )}
            {!unavailable && atMax && (
              <p className="text-label-en font-bold text-tertiary">Đã đạt giới hạn kho</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {qty > 0 && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); onRemove() }}
                  className="w-touch-target-min h-touch-target-min rounded-lg border border-outline-variant bg-surface-container-high text-primary text-xl font-bold flex items-center justify-center"
                  aria-label={`Giảm ${dish.name_vi}`}
                >
                  −
                </button>
                <span className="w-7 text-center font-bold text-[18px] text-on-surface">{qty}</span>
              </>
            )}
            {!atMax && (
              <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden>
                add_circle
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
