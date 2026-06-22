'use client'

import { useEffect, useState, useContext } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { BranchContext } from '../app-shell'
import { calculateDecrements } from '@/lib/stock'
import { getDateRangeStart, getPriorRangeStart, rankByQuantity, leastByQuantity, rankByRevenue, getRestockAlerts, getDailyRevenue, formatTimeRemaining } from '@/lib/analytics'
import type { RestockAlert } from '@/lib/analytics'
import { ChatPanel } from '@/components/chat-panel'
import { num } from '@/lib/types'
import type { Dish, Item, RecipeLine, UserRole } from '@/lib/types'

interface OrderWithLines {
  created_at: string
  order_items: Array<{ dish_id: string; qty: number; price_at_order: number | string }>
}

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
  const [orders, setOrders] = useState<OrderWithLines[]>([])
  const [dishes, setDishes] = useState<Dish[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [recipes, setRecipes] = useState<RecipeLine[]>([])
  const [role, setRole] = useState<UserRole | null>(null)
  const [chatDraft, setChatDraft] = useState<string | null>(null)
  const [daysInRange, setDaysInRange] = useState(1)
  const [priorRevenue, setPriorRevenue] = useState<number | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
      if (profile) setRole(profile.role)
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const now = new Date()
      const rangeStart = getDateRangeStart(now, preset)
      const priorRangeStart = getPriorRangeStart(rangeStart, preset)
      const [ordersRes, priorOrdersRes, dishesRes, itemsRes, recipesRes] = await Promise.all([
        supabase
          .from('orders')
          .select('created_at, order_items(dish_id, qty, price_at_order)')
          .eq('branch_id', branchId)
          .neq('status', 'cancelled')
          .gte('created_at', rangeStart.toISOString()),
        supabase
          .from('orders')
          .select('order_items(qty, price_at_order)')
          .eq('branch_id', branchId)
          .neq('status', 'cancelled')
          .gte('created_at', priorRangeStart.toISOString())
          .lt('created_at', rangeStart.toISOString()),
        supabase.from('dishes').select('*').eq('branch_id', branchId),
        supabase.from('items').select('*').eq('branch_id', branchId).eq('is_active', true),
        supabase.from('recipe_lines').select('*'),
      ])
      // Guards against a slow response from a preset the user has since
      // switched away from landing after a newer one and clobbering it —
      // same race class already found and fixed in ChatPanel's loadMessages.
      if (cancelled) return
      if (ordersRes.data) setOrders(ordersRes.data)
      if (priorOrdersRes.data) {
        const total = priorOrdersRes.data
          .flatMap(o => o.order_items)
          .reduce((sum, oi) => sum + oi.qty * num(oi.price_at_order), 0)
        setPriorRevenue(total)
      }
      if (dishesRes.data) setDishes(dishesRes.data)
      if (itemsRes.data) setItems(itemsRes.data)
      if (recipesRes.data) setRecipes(recipesRes.data)
      setDaysInRange((now.getTime() - rangeStart.getTime()) / 86_400_000)
    }

    load()
    return () => { cancelled = true }
  }, [branchId, preset])

  const orderLines = orders.flatMap(o => o.order_items)
  const topByQty = rankByQuantity(orderLines, dishes, TOP_N)
  const bottomByQty = leastByQuantity(orderLines, dishes, TOP_N)
  const topByRevenue = rankByRevenue(orderLines, dishes, TOP_N)
  const dailyRevenue = getDailyRevenue(orders)

  const currentRevenue = orderLines.reduce((sum, l) => sum + l.qty * num(l.price_at_order), 0)
  const percentChange = priorRevenue !== null && priorRevenue > 0
    ? ((currentRevenue - priorRevenue) / priorRevenue) * 100
    : null
  const averageOrderValue = orders.length > 0 ? Math.round(currentRevenue / orders.length) : 0

  const consumption = calculateDecrements(orderLines, recipes, true)
  const consumptionByItemId: Record<string, number> = {}
  for (const c of consumption) consumptionByItemId[c.item_id] = c.delta

  const alerts = getRestockAlerts(items, consumptionByItemId, daysInRange, URGENCY_THRESHOLD_DAYS)

  function handleNhanBep(alert: RestockAlert) {
    setChatDraft(`${alert.item.name_vi} sẽ hết trong ${formatTimeRemaining(alert.daysRemaining)}`)
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

      <div className="grid grid-cols-2 gap-stack-lg mb-stack-lg">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg">
          <p className="text-label-en text-on-surface-variant mb-1">Doanh thu</p>
          <p className="text-headline-md font-black text-on-surface">{currentRevenue.toLocaleString('vi-VN')}đ</p>
          {percentChange !== null && (
            <p className={`text-label-en font-bold mt-1 ${percentChange >= 0 ? 'text-secondary' : 'text-error'}`}>
              {percentChange >= 0 ? '↑' : '↓'} {Math.abs(percentChange).toFixed(0)}% so với kỳ trước
            </p>
          )}
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg">
          <p className="text-label-en text-on-surface-variant mb-1">Giá trị đơn trung bình</p>
          <p className="text-headline-md font-black text-on-surface">{averageOrderValue.toLocaleString('vi-VN')}đ</p>
        </div>
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
                  {a.item.name_vi} — còn {formatTimeRemaining(a.daysRemaining)}
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

      {preset !== 'today' && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg mb-stack-lg">
          <p className="text-label-vi font-bold text-on-surface mb-stack-md">Doanh thu theo ngày</p>
          {dailyRevenue.length === 0 ? (
            <p className="text-label-en text-on-surface-variant">Chưa có đơn nào</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dailyRevenue}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={v => v.toLocaleString('vi-VN')} />
                <Tooltip formatter={(v) => `${Number(v).toLocaleString('vi-VN')}đ`} />
                <Line type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-stack-lg">
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

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg">
          <p className="text-label-vi font-bold text-on-surface mb-stack-md">Bán ít nhất</p>
          {bottomByQty.length === 0 ? (
            <p className="text-label-en text-on-surface-variant">Chưa có món nào</p>
          ) : (
            <ul className="space-y-1">
              {bottomByQty.map(r => (
                <li key={r.dish.id} className="flex justify-between text-label-vi text-on-surface">
                  <span>{r.dish.name_vi}</span>
                  <span className="font-bold text-tertiary">{r.qty}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {chatDraft !== null && role === 'manager' && (
        <ChatPanel branchId={branchId} initialText={chatDraft} initialChannel="kitchen" onClose={() => setChatDraft(null)} />
      )}
    </div>
  )
}
