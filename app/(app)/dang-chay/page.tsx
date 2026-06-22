'use client'

import { useEffect, useRef, useState, useContext, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { OrderCard } from '@/components/order-card'
import { Toast } from '@/components/toast'
import { BranchContext } from '../app-shell'
import { reverseOrderStock } from '@/lib/stock'
import type { OrderWithDetails } from '@/lib/types'

export default function DangChayPage() {
  const { branchId } = useContext(BranchContext)
  const [orders, setOrders] = useState<OrderWithDetails[]>([])
  const [alertMessage, setAlertMessage] = useState<string | null>(null)
  const [alertTone, setAlertTone] = useState<'info' | 'error'>('info')
  const ordersRef = useRef<OrderWithDetails[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { ordersRef.current = orders }, [orders])

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
    return data as OrderWithDetails[] | null
  }, [branchId])

  function showAlert(message: string, tone: 'info' | 'error' = 'info') {
    setAlertTone(tone)
    setAlertMessage(message)
    setTimeout(() => setAlertMessage(null), 5000)
  }

  useEffect(() => {
    // Initial fetch on mount/branch change — async, not a synchronous setState call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders()

    const channel = supabase
      .channel(`active-orders-${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            const newOrderId = (payload.new as { id: string }).id
            loadOrders().then(data => {
              const newOrder = data?.find(o => o.id === newOrderId)
              if (newOrder) showAlert(`Đơn mới — ${newOrder.table.label}`)
            })
            return
          }

          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as { id: string; status: string; needs_stock_confirmation: boolean }
            const previousOrder = ordersRef.current.find(o => o.id === updated.id)
            if (updated.status === 'ready' && previousOrder?.status === 'pending') {
              showAlert(`Sẵn sàng giao — ${previousOrder.table.label}`)
            }
            // needs_stock_confirmation is left true by Kitchen's "Báo hết
            // hàng" specifically so this is distinguishable from FOH's own
            // ordinary cancel (which already clears it, or never set it).
            if (updated.status === 'cancelled' && updated.needs_stock_confirmation && previousOrder) {
              showAlert(`Hủy do hết hàng — ${previousOrder.table.label}`, 'error')
            }
          }

          loadOrders()
        },
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

  function handleReorder(tableId: string) {
    router.push(`/dat-mon?table=${tableId}`)
  }

  function handleEdit(orderId: string) {
    router.push(`/dat-mon?edit=${orderId}`)
  }

  if (orders.length === 0) {
    return (
      <>
        <Toast message={alertMessage} tone={alertTone} />
        <p className="text-on-surface-variant text-center mt-16 text-label-vi">
          Không có đơn nào đang chạy
        </p>
      </>
    )
  }

  return (
    <div className="space-y-stack-lg max-w-2xl mx-auto">
      <Toast message={alertMessage} tone={alertTone} />
      {orders.map((order, index) => (
        <div key={order.id} className="animate-fade-slide-up" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
          <OrderCard
            order={order}
            onCancel={handleCancel}
            onDeliver={handleDeliver}
            onReorder={handleReorder}
            onEdit={handleEdit}
          />
        </div>
      ))}
    </div>
  )
}
