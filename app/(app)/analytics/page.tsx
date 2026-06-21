'use client'

import { useEffect, useState, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BranchContext } from '../app-shell'
import { calculateDecrements } from '@/lib/stock'
import { getDateRangeStart, rankByQuantity, rankByRevenue, getRestockAlerts } from '@/lib/analytics'
import type { RestockAlert } from '@/lib/analytics'
import { ChatPanel } from '@/components/chat-panel'
import { num } from '@/lib/types'
import type { Dish, Item, RecipeLine, UserRole } from '@/lib/types'

type Preset = 'today' | '7d' | '30d'

const PRESET_LABELS: Record<Preset, string> = {
  today: 'Hôm nay',
  '7d': '7 ngày',
  '30d': '30 ngày',
}

const URGENCY_THRESHOLD_DAYS = 3
const TOP_N = 5

export default function AnalyticsPage() {
  const { branchId } = useContext(BranchContext)
  const [preset, setPreset] = useState<Preset>('today')
  const [orderLines, setOrderLines] = useState<Array<{ dish_id: string; qty: number; price_at_order: number | string }>>([])
  const [dishes, setDishes] = useState<Dish[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [recipes, setRecipes] = useState<RecipeLine[]>([])
  const [role, setRole] = useState<UserRole | null>(null)
  const [chatDraft, setChatDraft] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
      if (profile) setRole(profile.role)
    })
  }, [])

  useEffect(() => {
    async function load() {
      const rangeStart = getDateRangeStart(new Date(), preset)
      const [ordersRes, dishesRes, itemsRes, recipesRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_items(dish_id, qty, price_at_order)')
          .eq('branch_id', branchId)
          .neq('status', 'cancelled')
          .gte('created_at', rangeStart.toISOString()),
        supabase.from('dishes').select('*').eq('branch_id', branchId),
        supabase.from('items').select('*').eq('branch_id', branchId).eq('is_active', true),
        supabase.from('recipe_lines').select('*'),
      ])
      if (ordersRes.data) setOrderLines(ordersRes.data.flatMap(o => o.order_items))
      if (dishesRes.data) setDishes(dishesRes.data)
      if (itemsRes.data) setItems(itemsRes.data)
      if (recipesRes.data) setRecipes(recipesRes.data)
    }
    load()
  }, [branchId, preset])

  const rangeStart = getDateRangeStart(new Date(), preset)
  const daysInRange = (Date.now() - rangeStart.getTime()) / 86_400_000

  const topByQty = rankByQuantity(orderLines, dishes, TOP_N)
  const topByRevenue = rankByRevenue(orderLines, dishes, TOP_N)

  const consumption = calculateDecrements(orderLines, recipes, true)
  const consumptionByItemId: Record<string, number> = {}
  for (const c of consumption) consumptionByItemId[c.item_id] = c.delta

  const alerts = getRestockAlerts(items, consumptionByItemId, daysInRange, URGENCY_THRESHOLD_DAYS)

  function handleNhanBep(alert: RestockAlert) {
    setChatDraft(`${alert.item.name_vi} sẽ hết trong ~${alert.daysRemaining.toFixed(1)} ngày`)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-headline-md font-bold text-on-surface mb-stack-lg">Thống kê</h2>

      <div className="flex gap-2 mb-stack-lg">
        {(['today', '7d', '30d'] as Preset[]).map(p => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`px-4 rounded-full text-label-vi font-bold min-h-touch-target-min transition-colors ${
              preset === p ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="rounded-xl border-2 border-error bg-error-container/20 p-stack-lg mb-stack-lg">
          <p className="text-label-vi font-bold text-error mb-stack-md flex items-center gap-1">
            <span className="material-symbols-outlined text-[18px]" aria-hidden>warning</span>
            Cần nhập hàng sớm
          </p>
          <ul className="space-y-2">
            {alerts.map(a => (
              <li key={a.item.id} className="flex items-center justify-between gap-2">
                <span className="text-label-vi text-on-surface">
                  {a.item.name_vi} — còn ~{a.daysRemaining.toFixed(1)} ngày
                </span>
                {role === 'manager' && (
                  <button onClick={() => handleNhanBep(a)} className="text-label-en font-bold text-error shrink-0">
                    Nhắn bếp
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-lg">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg">
          <p className="text-label-vi font-bold text-on-surface mb-stack-md">Bán chạy (số lượng)</p>
          {topByQty.length === 0 ? (
            <p className="text-label-en text-on-surface-variant">Chưa có đơn nào</p>
          ) : (
            <ul className="space-y-1">
              {topByQty.map(r => (
                <li key={r.dish.id} className="flex justify-between text-label-vi text-on-surface">
                  <span>{r.dish.name_vi}</span>
                  <span className="font-bold text-primary">{r.qty}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg">
          <p className="text-label-vi font-bold text-on-surface mb-stack-md">Bán chạy (doanh thu)</p>
          {topByRevenue.length === 0 ? (
            <p className="text-label-en text-on-surface-variant">Chưa có đơn nào</p>
          ) : (
            <ul className="space-y-1">
              {topByRevenue.map(r => (
                <li key={r.dish.id} className="flex justify-between text-label-vi text-on-surface">
                  <span>{r.dish.name_vi}</span>
                  <span className="font-bold text-primary">{r.revenue.toLocaleString('vi-VN')}đ</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {chatDraft !== null && role === 'manager' && (
        <ChatPanel role={role} branchId={branchId} initialText={chatDraft} onClose={() => setChatDraft(null)} />
      )}
    </div>
  )
}
