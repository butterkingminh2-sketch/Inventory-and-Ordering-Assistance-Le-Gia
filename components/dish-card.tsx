'use client'

import { useState } from 'react'
import type { Dish } from '@/lib/types'
import type { DishStatus } from '@/lib/dish-availability'
import { useLanguage } from '@/lib/language-context'
import { pickName } from '@/lib/language'
import { BilingualText } from '@/components/bilingual-text'

interface Props {
  dish: Dish
  status: DishStatus
  qty: number
  atMax: boolean
  onCardTap: () => void
  onRemove: () => void
}

export function DishCard({ dish, status, qty, atMax, onCardTap, onRemove }: Props) {
  const { language } = useLanguage()
  const unavailable = status === 'unavailable'
  const [imageError, setImageError] = useState(false)
  const dishName = pickName(dish, language)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onCardTap}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardTap() }
      }}
      aria-label={`Tùy chọn ${dishName}`}
      className={`rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden cursor-pointer select-none active:scale-[0.98] transition-transform ${unavailable ? 'opacity-50' : ''}`}
    >
      <div className="aspect-[4/3] bg-surface-container-high flex items-center justify-center">
        {dish.image_url && !imageError ? (
          <img
            src={dish.image_url}
            alt={dishName}
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
        <p className="text-label-vi font-bold text-on-surface truncate">{dishName}</p>

        <div className="flex items-center justify-between mt-2">
          <div className="flex-1 min-w-0">
            {status === 'low' && (
              <BilingualText vi="Sắp hết nguyên liệu" en="Low on ingredients" className="text-label-en font-bold text-tertiary" />
            )}
            {status === 'unavailable' && (
              <BilingualText vi="Hết nguyên liệu" en="Out of ingredients" className="text-label-en font-bold text-error" />
            )}
            {!unavailable && atMax && (
              <BilingualText vi="Đã đạt giới hạn kho" en="Stock limit reached" className="text-label-en font-bold text-tertiary" />
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {qty > 0 && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); onRemove() }}
                  className="w-touch-target-min h-touch-target-min rounded-lg border border-outline-variant bg-surface-container-high text-primary text-xl font-bold flex items-center justify-center active:scale-90 transition-transform"
                  aria-label={`Giảm ${dishName}`}
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
