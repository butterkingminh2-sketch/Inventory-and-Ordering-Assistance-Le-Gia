'use client'

import { useEffect, useState, useContext, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { OrderCard } from '@/components/order-card'
import { BranchContext } from '../app-shell'
import { reverseOrderStock } from '@/lib/stock'
import type { OrderWithDetails } from '@/lib/types'

export default function DangChayPage() {
  const { branchId } = useContext(BranchContext)
  const [orders, setOrders] = useState<OrderWithDetails[]>([])
  const supabase = createClient()

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        table:tables(label),
        order_items(*, dish:dishes(name_vi, name_en))
      `)
      .eq('branch_id', branchId)
      .in('status', ['pending', 'ready'])
      .order('created_at', { ascending: true })
    if (data) setOrders(data as OrderWithDetails[])
  }, [branchId])

  useEffect(() => {
    // Initial fetch on mount/branch change — async, not a synchronous setState call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders()

    const channel = supabase
      .channel(`active-orders-${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        () => loadOrders(),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [branchId, loadOrders])

  async function handleCancel(orderId: string) {
    const order = orders.find(o => o.id === orderId)
    if (!order || !['pending', 'ready'].includes(order.status)) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
    await reverseOrderStock(orderId, user.id)
  }

  async function handleDeliver(orderId: string) {
    const order = orders.find(o => o.id === orderId)
    if (!order || order.status !== 'ready') return
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId)
  }

  if (orders.length === 0) {
    return (
      <p className="text-on-surface-variant text-center mt-16 text-label-vi">
        Không có đơn nào đang chạy
      </p>
    )
  }

  return (
    <div className="space-y-stack-lg max-w-2xl mx-auto">
      {orders.map(order => (
        <OrderCard
          key={order.id}
          order={order}
          onCancel={handleCancel}
          onDeliver={handleDeliver}
        />
      ))}
    </div>
  )
}
