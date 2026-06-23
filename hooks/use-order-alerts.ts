'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/language-context'
import { pickLabel } from '@/lib/language'

interface OrderRow {
  id: string
  status: string
  needs_stock_confirmation: boolean
}

/**
 * Watches order INSERTs and pending -> ready transitions for a branch,
 * returning a toast message to render via <Toast>. Tracks each order's
 * last-known status itself — payload.old from postgres_changes isn't
 * reliably populated unless REPLICA IDENTITY FULL is set on the table —
 * seeded from an initial fetch so transitions are caught even for orders
 * that existed before this hook mounted.
 */
export function useOrderAlerts(branchId: string | null) {
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<'info' | 'error'>('info')
  const knownStatus = useRef<Map<string, string>>(new Map())
  const { language } = useLanguage()
  const languageRef = useRef(language)

  // Kept out of the main subscription effect's deps below — `t` from
  // useLanguage() is a new function reference every render, and even this
  // primitive `language` value must not retrigger the effect, since that
  // would tear down and recreate the realtime channel on every toggle.
  useEffect(() => { languageRef.current = language }, [language])

  useEffect(() => {
    if (!branchId) return
    const supabase = createClient()

    function showAlert(text: string, alertTone: 'info' | 'error' = 'info') {
      setTone(alertTone)
      setMessage(text)
      setTimeout(() => setMessage(null), 5000)
    }

    async function lookupTableLabel(orderId: string): Promise<string | null> {
      const { data } = await supabase
        .from('orders')
        .select('table:tables(label)')
        .eq('id', orderId)
        .single()
      return (data as { table: { label: string } | null } | null)?.table?.label ?? null
    }

    supabase
      .from('orders')
      .select('id, status, needs_stock_confirmation')
      .eq('branch_id', branchId)
      .in('status', ['pending', 'ready'])
      .then(({ data }) => {
        (data as OrderRow[] | null)?.forEach(o => knownStatus.current.set(o.id, o.status))
      })

    const channel = supabase
      .channel(`order-alerts-${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        async payload => {
          const row = payload.new as OrderRow | undefined
          if (!row) return

          if (payload.eventType === 'INSERT') {
            knownStatus.current.set(row.id, row.status)
            const label = await lookupTableLabel(row.id)
            if (label) showAlert(`${pickLabel(languageRef.current, 'Đơn mới', 'New order')} — ${label}`)
            return
          }

          if (payload.eventType === 'UPDATE') {
            const previousStatus = knownStatus.current.get(row.id)
            knownStatus.current.set(row.id, row.status)
            if (row.status === 'ready' && previousStatus === 'pending') {
              const label = await lookupTableLabel(row.id)
              if (label) showAlert(`${pickLabel(languageRef.current, 'Sẵn sàng giao', 'Ready for delivery')} — ${label}`)
            }
            // needs_stock_confirmation is left true by Kitchen's "Báo hết
            // hàng" specifically so this is distinguishable from FOH's own
            // ordinary cancel (which already clears it, or never set it).
            if (row.status === 'cancelled' && row.needs_stock_confirmation && previousStatus !== 'cancelled') {
              const label = await lookupTableLabel(row.id)
              if (label) showAlert(`${pickLabel(languageRef.current, 'Hủy do hết hàng', 'Cancelled due to out of stock')} — ${label}`, 'error')
            }
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [branchId])

  return { message, tone }
}
