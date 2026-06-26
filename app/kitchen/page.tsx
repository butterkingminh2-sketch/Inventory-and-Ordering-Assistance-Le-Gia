'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { elapsedLabel } from '@/lib/order-urgency'
import { groupAdjacentByTable } from '@/lib/order-grouping'
import { linesFromOrderItems, groupIdenticalLines } from '@/lib/order-lines'
import { reverseOrderStock } from '@/lib/stock'
import { Toast } from '@/components/toast'
import { useLanguage } from '@/lib/language-context'
import { pickName, pickLabel } from '@/lib/language'
import type { OrderWithDetails } from '@/lib/types'

export default function KitchenPage() {
  const [orders, setOrders]   = useState<OrderWithDetails[]>([])
  const [branchId, setBranchId] = useState<string | null>(null)
  const [newOrderAlert, setNewOrderAlert] = useState<string | null>(null)
  const supabase = createClient()
  const { t, language } = useLanguage()
  const languageRef = useRef(language)

  // Kept out of the main subscription effect's deps below — `t` from
  // useLanguage() is a new function reference every render, and even this
  // primitive `language` value must not retrigger the effect, since that
  // would tear down and recreate the realtime channel on every toggle.
  useEffect(() => { languageRef.current = language }, [language])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('user_profiles').select('branch_id').eq('id', user.id).single()
      if (profile) setBranchId(profile.branch_id)
    }
    init()
  }, [])

  const loadOrders = async (bid: string) => {
    const { data } = await supabase
      .from('orders')
      .select(`*, table:tables(label), order_items(*, dish:dishes(name_vi, name_en))`)
      .eq('branch_id', bid)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (data) setOrders(data as OrderWithDetails[])
    return data as OrderWithDetails[] | null
  }

  useEffect(() => {
    if (!branchId) return
    // Initial fetch on mount/branch change — async, not a synchronous setState call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders(branchId)

    const channel = supabase
      .channel(`kitchen-orders-${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            const newOrderId = (payload.new as { id: string }).id
            loadOrders(branchId).then(data => {
              const newOrder = data?.find(o => o.id === newOrderId)
              setNewOrderAlert(`${pickLabel(languageRef.current, 'Đơn mới', 'New order')} — ${newOrder?.table?.label ?? ''}`)
              setTimeout(() => setNewOrderAlert(null), 5000)
            })
          } else {
            loadOrders(branchId)
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [branchId])

  async function handleXong(orderId: string) {
    await supabase
      .from('orders')
      .update({ status: 'ready', ready_at: new Date().toISOString() })
      .eq('id', orderId)
  }

  async function handleConfirmStock(orderId: string) {
    await supabase
      .from('orders')
      .update({ needs_stock_confirmation: false })
      .eq('id', orderId)
  }

  async function handleOutOfStock(orderId: string) {
    if (!window.confirm(t('Báo hết hàng và hủy đơn này? FOH sẽ được thông báo.', 'Report out of stock and cancel this order? Front of house will be notified.'))) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // needs_stock_confirmation is set true here regardless of whether the
    // order was already flagged — it's the marker Đang chạy/Đặt món use to
    // show "hủy do hết hàng" instead of a plain cancellation, so FOH knows
    // why the order disappeared even when the system never suspected a
    // stock problem in the first place (the tracked count was just wrong).
    await supabase.from('orders').update({ status: 'cancelled', needs_stock_confirmation: true }).eq('id', orderId)
    await reverseOrderStock(orderId, user.id)
  }

  if (orders.length === 0) {
    return (
      <>
        <Toast message={newOrderAlert} tone="info" />
        <p className="text-on-surface-variant text-center mt-16 text-label-vi">
          {t('Không có đơn nào — Bếp rảnh 🎉', 'No orders — kitchen is clear 🎉')}
        </p>
      </>
    )
  }

  const grouped = groupAdjacentByTable(orders)

  return (
    <div className="max-w-2xl mx-auto">
      <Toast message={newOrderAlert} tone="info" />
      {grouped.map((order, i) => {
        const isAddOn = i > 0 && grouped[i - 1].table_id === order.table_id
        const isLastOfGroup = i === grouped.length - 1 || grouped[i + 1].table_id !== order.table_id

        const roundingCls =
          !isAddOn && isLastOfGroup ? 'rounded-xl' :
          !isAddOn ? 'rounded-t-xl' :
          isLastOfGroup ? 'rounded-b-xl' :
          ''
        const marginCls = i === 0 ? '' : isAddOn ? 'mt-0' : 'mt-stack-lg'

        const dishNames = new Map(order.order_items.map(oi => [oi.dish_id, pickName(oi.dish, language)]))
        const groupedLines = groupIdenticalLines(linesFromOrderItems(order.order_items))
        const needsConfirmation = order.needs_stock_confirmation

        // Once flagged, the whole-card tap becomes ambiguous between two
        // very different actions — replaced with two explicit buttons
        // instead, rather than guessing which one a stray tap meant.
        const wholeCardProps = needsConfirmation ? {} : {
          role: 'button' as const,
          tabIndex: 0,
          'aria-label': `${t('Đánh dấu xong', 'Mark done')} — ${order.table?.label ?? t('bàn đã xóa', 'table deleted')}${isAddOn ? `, ${t('đơn mới', 'new order')}` : ''}`,
          onClick: () => handleXong(order.id),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleXong(order.id) }
          },
        }

        return (
          <div
            key={order.id}
            {...wholeCardProps}
            className={`border overflow-hidden shadow-sm bg-surface-container-lowest ${
              needsConfirmation ? '' : 'cursor-pointer select-none active:scale-[0.98] transition-transform'
            } ${roundingCls} ${marginCls} ${
              needsConfirmation ? 'border-error' : isAddOn ? 'border-primary' : 'border-outline-variant'
            }`}
          >
            <div className="px-stack-lg pt-stack-md flex items-center justify-between gap-2">
              <div className="flex gap-2">
                {isAddOn && (
                  <span className="inline-block bg-tertiary-fixed text-on-tertiary-fixed text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                    + {t('Đơn mới', 'New order')}
                  </span>
                )}
                {needsConfirmation && (
                  <span className="inline-block bg-error-container text-on-error-container text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                    {t('Thiếu tồn kho', 'Stock shortage')}
                  </span>
                )}
              </div>
              {/* Stock counts can be wrong even when nothing flagged this
                  order — kitchen needs a way to say so regardless, not
                  just on orders the system already suspected. */}
              {!needsConfirmation && (
                <button
                  onClick={e => { e.stopPropagation(); handleOutOfStock(order.id) }}
                  className="min-h-touch-target-min px-3 rounded-full flex items-center gap-1.5 text-label-en font-bold text-error bg-error-container active:scale-95 transition-all shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden>report</span>
                  {t('Báo hết hàng', 'Report out of stock')}
                </button>
              )}
            </div>

            <div className="p-stack-lg space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-headline-md font-bold text-on-surface">{order.table?.label ?? t('Bàn đã xóa', 'Table deleted')}</p>
                <p className="text-label-en text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden>schedule</span>
                  {elapsedLabel(order.created_at, t)}
                </p>
              </div>

              <ul className="space-y-1 pt-1">
                {groupedLines.map((line, li) => {
                  const toppingEntries = Object.entries(line.toppings).filter(([, qty]) => qty > 0)
                  return (
                    <li key={li} className="flex justify-between text-body-lg font-medium text-on-surface">
                      <span>
                        {dishNames.get(line.dishId) ?? ''}
                        {toppingEntries.map(([toppingId, qty]) => (
                          <span key={toppingId} className="block text-label-en text-on-surface-variant">
                            {dishNames.get(toppingId) ?? ''}{qty > 1 ? ` ×${qty}` : ''}
                          </span>
                        ))}
                        {line.note && <span className="block text-label-en font-bold text-tertiary">{t('Lưu ý', 'Note')}: {line.note}</span>}
                      </span>
                      <span className="font-black text-primary">×{line.qty}</span>
                    </li>
                  )
                })}
              </ul>
            </div>

            {needsConfirmation ? (
              <div className="flex">
                <button
                  onClick={() => handleConfirmStock(order.id)}
                  className="flex-1 min-h-touch-target-min text-label-vi font-bold flex items-center justify-center gap-2 bg-secondary text-on-secondary active:scale-[0.98] transition-transform"
                >
                  <span className="material-symbols-outlined text-[22px]" aria-hidden>inventory_2</span>
                  {t('Xác nhận còn hàng', 'Confirm in stock')}
                </button>
                <button
                  onClick={() => handleOutOfStock(order.id)}
                  className="flex-1 min-h-touch-target-min text-label-vi font-bold flex items-center justify-center gap-2 bg-error text-on-error active:scale-[0.98] transition-transform"
                >
                  <span className="material-symbols-outlined text-[22px]" aria-hidden>cancel</span>
                  {t('Báo hết hàng', 'Report out of stock')}
                </button>
              </div>
            ) : (
              <div className="w-full min-h-touch-target-min text-label-vi font-bold flex items-center justify-center gap-2 bg-secondary text-on-secondary">
                <span className="material-symbols-outlined text-[24px]" aria-hidden>check_circle</span>
                {t('Xong ✓ — chạm bất kỳ đâu trên thẻ', 'Done ✓ — tap anywhere on the card')}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
