'use client'

import { useEffect, useRef, useState } from 'react'
import { isUrgent, elapsedLabel } from '@/lib/order-urgency'
import { linesFromOrderItems, groupIdenticalLines } from '@/lib/order-lines'
import type { OrderWithDetails } from '@/lib/types'

interface Props {
  order: OrderWithDetails
  onCancel: (orderId: string) => void
  onDeliver: (orderId: string) => void
  onReorder: (tableId: string) => void
  onEdit: (orderId: string) => void
}

export function OrderCard({ order, onCancel, onDeliver, onReorder, onEdit }: Props) {
  const urgent = order.status === 'ready' && isUrgent(order.ready_at)
  const prevStatusRef = useRef(order.status)
  const [justBecameReady, setJustBecameReady] = useState(false)

  useEffect(() => {
    if (prevStatusRef.current !== order.status) {
      const becameReady = prevStatusRef.current === 'pending' && order.status === 'ready'
      prevStatusRef.current = order.status
      if (becameReady) {
        setJustBecameReady(true)
        const timeout = setTimeout(() => setJustBecameReady(false), 1000)
        return () => clearTimeout(timeout)
      }
    }
  }, [order.status])

  const dishNames = new Map(order.order_items.map(oi => [oi.dish_id, oi.dish.name_vi]))
  const groupedLines = groupIdenticalLines(linesFromOrderItems(order.order_items))

  return (
    <article
      className={`rounded-xl overflow-hidden shadow-sm flex flex-col md:flex-row ${
        urgent
          ? 'bg-surface-container-lowest border-2 border-error animate-pulse-critical'
          : 'bg-surface-container-lowest border border-outline-variant'
      } ${justBecameReady ? 'animate-status-flash' : ''}`}
    >
      {/* Left: order info */}
      <div className="flex-1 p-stack-lg space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-headline-md font-bold text-on-surface">{order.table?.label ?? 'Bàn đã xóa'}</p>
          <span className={`text-status-badge font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
            order.status === 'ready'
              ? 'bg-secondary-container text-on-secondary-container'
              : order.needs_stock_confirmation
                ? 'bg-error-container text-on-error-container'
                : 'bg-tertiary-fixed text-on-tertiary-fixed'
          }`}>
            {order.status === 'ready' ? 'Xong' : order.needs_stock_confirmation ? 'Đợi bếp xác nhận' : 'Đang nấu'}
          </span>
        </div>

        <p className={`text-label-en flex items-center gap-1 ${urgent ? 'text-error font-black' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined text-[16px]" aria-hidden>
            {urgent ? 'warning' : 'schedule'}
          </span>
          {urgent ? 'Quá hạn · ' : ''}{elapsedLabel(order.created_at)}
        </p>

        <ul className="space-y-1 pt-1">
          {groupedLines.map((line, li) => {
            const toppingEntries = Object.entries(line.toppings).filter(([, qty]) => qty > 0)
            return (
              <li key={li} className="flex justify-between text-body-md text-on-surface">
                <span>
                  {dishNames.get(line.dishId) ?? ''}
                  {toppingEntries.map(([toppingId, qty]) => (
                    <span key={toppingId} className="block text-label-en text-on-surface-variant">
                      {dishNames.get(toppingId) ?? ''}{qty > 1 ? ` ×${qty}` : ''}
                    </span>
                  ))}
                  {line.note && <span className="block text-label-en text-on-surface-variant">{line.note}</span>}
                </span>
                <span className="font-bold text-primary">×{line.qty}</span>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Right: action buttons */}
      <div className="flex md:flex-col border-t md:border-t-0 md:border-l border-outline-variant">
        {/* table_id! is safe today: the only place orders are created (Đặt món's
            handleSubmit) requires a non-null selectedTable before inserting. If a
            future order-creation path skips that guard, this assertion would lie. */}
        <button
          onClick={() => onReorder(order.table_id!)}
          className="flex-1 min-h-touch-target-min px-stack-lg flex flex-col items-center justify-center gap-1 text-primary hover:bg-primary-fixed active:scale-95 transition-all last:rounded-br-xl"
          aria-label="Thêm món"
        >
          <span className="material-symbols-outlined text-[24px]" aria-hidden>add_circle</span>
          <span className="text-label-en font-bold">Thêm món</span>
        </button>

        {order.status === 'pending' && (
          <button
            onClick={() => onEdit(order.id)}
            className="flex-1 min-h-touch-target-min px-stack-lg flex flex-col items-center justify-center gap-1 text-primary hover:bg-primary-fixed active:scale-95 transition-all last:rounded-br-xl"
            aria-label="Sửa đơn"
          >
            <span className="material-symbols-outlined text-[24px]" aria-hidden>edit</span>
            <span className="text-label-en font-bold">Sửa đơn</span>
          </button>
        )}

        <button
          onClick={() => onCancel(order.id)}
          className="flex-1 min-h-touch-target-min px-stack-lg flex flex-col items-center justify-center gap-1 text-error hover:bg-error-container active:scale-95 transition-all last:rounded-br-xl"
          aria-label="Hủy đơn"
        >
          <span className="material-symbols-outlined text-[24px]" aria-hidden>cancel</span>
          <span className="text-label-en font-bold">Hủy</span>
        </button>

        {order.status === 'ready' && (
          <button
            onClick={() => onDeliver(order.id)}
            className="flex-1 min-h-touch-target-min md:min-h-24 px-stack-lg flex flex-col items-center justify-center gap-1 bg-secondary text-on-secondary hover:bg-on-secondary-container transition-all active:scale-95 md:w-48 last:rounded-br-xl"
            aria-label="Đã mang ra"
          >
            <span className="material-symbols-outlined text-[40px]" aria-hidden>check_circle</span>
            <span className="text-label-vi font-bold">Đã mang ra</span>
            <span className="text-label-en opacity-80">Delivered</span>
          </button>
        )}
      </div>
    </article>
  )
}
