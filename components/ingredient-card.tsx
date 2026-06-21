'use client'

import { useState } from 'react'
import { num } from '@/lib/types'
import type { Item } from '@/lib/types'
import { QuantityInput } from './quantity-input'

type Status = 'sufficient' | 'low' | 'out'

function getStatus(item: Item): Status {
  const qty = num(item.quantity)
  const threshold = num(item.low_threshold)
  if (qty <= 0) return 'out'
  if (qty <= threshold) return 'low'
  return 'sufficient'
}

const badge = {
  sufficient: { label: 'Đủ',      classes: 'bg-secondary-container text-on-secondary-container' },
  low:        { label: 'Sắp hết', classes: 'bg-tertiary-container text-on-tertiary-container' },
  out:        { label: 'Hết',     classes: 'bg-error text-on-error' },
}

const cardWrapper = {
  sufficient: 'bg-surface-container-lowest border border-outline-variant rounded-xl p-5',
  low:        'bg-surface-container-lowest border border-outline-variant rounded-xl p-5 ring-1 ring-tertiary-fixed-dim',
  out:        'bg-error-container/20 border-2 border-error ring-2 ring-error/10 ring-offset-2 rounded-xl p-5',
}

const qtyColor = {
  sufficient: 'text-primary',
  low:        'text-tertiary',
  out:        'text-error',
}

interface Props {
  item: Item
  onAdjust: (id: string, delta: 1 | -1) => void
  onSetQuantity: (id: string, newQuantity: number) => void
}

export function IngredientCard({ item, onAdjust, onSetQuantity }: Props) {
  const status = getStatus(item)
  const qty = num(item.quantity)
  const [editing, setEditing] = useState(false)

  return (
    <article className={cardWrapper[status]}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-headline-md font-bold text-on-surface truncate">{item.name_vi}</p>
          {item.name_en && (
            <p className="text-label-en text-on-surface-variant truncate">{item.name_en}</p>
          )}
        </div>
        <span className={`shrink-0 text-status-badge font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${badge[status].classes}`}>
          {badge[status].label}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          {editing ? (
            <QuantityInput
              value={qty}
              unit={item.unit}
              autoFocus
              inputClassName="w-24 border border-outline-variant rounded-lg px-2 py-1 text-[28px] font-black text-primary bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
              onConfirm={newQty => { onSetQuantity(item.id, newQty); setEditing(false) }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Sửa số lượng ${item.name_vi}`}
              className={`text-[32px] font-black leading-none ${qtyColor[status]} border-b-2 border-dashed border-current`}
            >
              {qty}
            </button>
          )}
          {!editing && (
            <>
              {' '}
              <span className="text-label-en text-on-surface-variant">{item.unit}</span>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onAdjust(item.id, -1)}
            aria-label={`Giảm ${item.name_vi}`}
            className="w-touch-target-min h-touch-target-min bg-surface-container-high rounded-lg border border-outline-variant text-primary text-xl font-bold flex items-center justify-center"
          >
            −
          </button>
          <button
            onClick={() => onAdjust(item.id, 1)}
            aria-label={`Tăng ${item.name_vi}`}
            className="w-touch-target-min h-touch-target-min bg-primary text-on-primary rounded-lg shadow-md text-xl font-bold flex items-center justify-center"
          >
            +
          </button>
        </div>
      </div>
    </article>
  )
}
