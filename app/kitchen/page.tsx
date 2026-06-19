'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { elapsedLabel } from '@/lib/order-urgency'
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

  return (
    <div className="space-y-stack-lg max-w-2xl mx-auto">
      {orders.map(order => (
        <article
          key={order.id}
          className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden shadow-sm"
        >
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
                  <span>{oi.dish.name_vi}</span>
                  <span className="font-black text-primary">×{oi.qty}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={() => handleXong(order.id)}
            className="w-full min-h-touch-target-min bg-secondary text-on-secondary text-label-vi font-bold flex items-center justify-center gap-2 hover:bg-on-secondary-container transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[24px]" aria-hidden>check_circle</span>
            Xong ✓
          </button>
        </article>
      ))}
    </div>
  )
}
