'use client'

import { useEffect, useRef, useState, useContext, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { OrderCard } from '@/components/order-card'
import { Toast } from '@/components/toast'
import { BranchContext } from '../app-shell'
import { reverseOrderStock } from '@/lib/stock'
import { useLanguage } from '@/lib/language-context'
import { pickLabel } from '@/lib/language'
import type { OrderWithDetails } from '@/lib/types'

export default function DangChayPage() {
  const { branchId } = useContext(BranchContext)
  const [orders, setOrders] = useState<OrderWithDetails[]>([])
  const [alertMessage, setAlertMessage] = useState<string | null>(null)
  const [alertTone, setAlertTone] = useState<'info' | 'error'>('info')
  const ordersRef = useRef<OrderWithDetails[]>([])
  const router = useRouter()
  const supabase = createClient()
  const { t, language } = useLanguage()
  const languageRef = useRef(language)

  // Kept out of the main subscription effect's deps below — `t` from
  // useLanguage() is a new function reference every render, and even this
  // primitive `language` value must not retrigger the effect, since that
  // would tear down and recreate the realtime channel on every toggle.
  useEffect(() => { languageRef.current = language }, [language])

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
              if (newOrder) showAlert(`${pickLabel(languageRef.current, 'Đơn mới', 'New order')} — ${newOrder.table?.label ?? pickLabel(languageRef.current, 'bàn đã xóa', 'table deleted')}`)
            })
            return
          }

          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as { id: string; status: string; needs_stock_confirmation: boolean }
            const previousOrder = ordersRef.current.find(o => o.id === updated.id)
            if (updated.status === 'ready' && previousOrder?.status === 'pending') {
              showAlert(`${pickLabel(languageRef.current, 'Sẵn sàng giao', 'Ready for delivery')} — ${previousOrder.table?.label ?? pickLabel(languageRef.current, 'bàn đã xóa', 'table deleted')}`)
            }
            // needs_stock_confirmation is left true by Kitchen's "Báo hết
            // hàng" specifically so this is distinguishable from FOH's own
            // ordinary cancel, which clears it via handleCancel below.
            if (updated.status === 'cancelled' && updated.needs_stock_confirmation && previousOrder) {
              showAlert(`${pickLabel(languageRef.current, 'Hủy do hết hàng', 'Cancelled due to out of stock')} — ${previousOrder.table?.label ?? pickLabel(languageRef.current, 'bàn đã xóa', 'table deleted')}`, 'error')
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

    // Clears needs_stock_confirmation explicitly — an ordinary FOH cancel is
    // not the same event as Kitchen's "Báo hết hàng", and leaving a
    // previously-flagged order's flag set would make this cancel look like
    // a kitchen-reported stock issue in the alert above.
    await supabase.from('orders').update({ status: 'cancelled', needs_stock_confirmation: false }).eq('id', orderId)
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
          {t('Không có đơn nào đang chạy', 'No active orders')}
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
