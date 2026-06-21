'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { elapsedLabel } from '@/lib/order-urgency'
import { groupAdjacentByTable } from '@/lib/order-grouping'
import type { OrderWithDetails } from '@/lib/types'

export default function KitchenPage() {
  const [orders, setOrders]   = useState<OrderWithDetails[]>([])
  const [branchId, setBranchId] = useState<string | null>(null)
  const supabase = createClient()

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
        () => loadOrders(branchId),
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

  if (orders.length === 0) {
    return (
      <p className="text-on-surface-variant text-center mt-16 text-label-vi">
        Không có đơn nào — Bếp rảnh 🎉
      </p>
    )
  }

  const grouped = groupAdjacentByTable(orders)

  return (
    <div className="max-w-2xl mx-auto">
      {grouped.map((order, i) => {
        const isAddOn = i > 0 && grouped[i - 1].table_id === order.table_id
        const isLastOfGroup = i === grouped.length - 1 || grouped[i + 1].table_id !== order.table_id

        const roundingCls =
          !isAddOn && isLastOfGroup ? 'rounded-xl' :
          !isAddOn ? 'rounded-t-xl' :
          isLastOfGroup ? 'rounded-b-xl' :
          ''
        const marginCls = i === 0 ? '' : isAddOn ? 'mt-0' : 'mt-stack-lg'

        return (
          <div
            key={order.id}
            role="button"
            tabIndex={0}
            aria-label={`Đánh dấu xong — ${order.table.label}${isAddOn ? ', đơn mới' : ''}`}
            onClick={() => handleXong(order.id)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleXong(order.id) }
            }}
            className={`border overflow-hidden shadow-sm cursor-pointer select-none active:scale-[0.98] transition-transform bg-surface-container-lowest ${roundingCls} ${marginCls} ${
              isAddOn ? 'border-primary' : 'border-outline-variant'
            }`}
          >
            {isAddOn && (
              <div className="px-stack-lg pt-stack-md">
                <span className="inline-block bg-tertiary-fixed text-on-tertiary-fixed text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                  + Đơn mới
                </span>
              </div>
            )}

            <div className="p-stack-lg space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-headline-md font-bold text-on-surface">{order.table.label}</p>
                <p className="text-label-en text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden>schedule</span>
                  {elapsedLabel(order.created_at)}
                </p>
              </div>

              <ul className="space-y-1 pt-1">
                {order.order_items.map(oi => (
                  <li key={oi.id} className="flex justify-between text-body-lg font-medium text-on-surface">
                    <span>
                      {oi.dish.name_vi}
                      {oi.note && <span className="block text-label-en font-bold text-error">{oi.note}</span>}
                    </span>
                    <span className="font-black text-primary">×{oi.qty}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="w-full min-h-touch-target-min bg-secondary text-on-secondary text-label-vi font-bold flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[24px]" aria-hidden>check_circle</span>
              Xong ✓ — chạm bất kỳ đâu trên thẻ
            </div>
          </div>
        )
      })}
    </div>
  )
}
