export type UserRole = 'foh' | 'kitchen' | 'manager'
export type OrderStatus = 'pending' | 'ready' | 'delivered' | 'cancelled'

/** PostgREST serializes Postgres `numeric` columns as strings. Call parseFloat() or Number() before arithmetic. */
export function num(v: number | string): number {
  return typeof v === 'string' ? parseFloat(v) : v
}

export interface Branch {
  id: string
  name: string
  created_at: string
}

export interface Item {
  id: string
  branch_id: string
  name_vi: string
  name_en: string | null
  unit: string
  quantity: number | string
  low_threshold: number | string
  is_active: boolean
  created_at: string
}

export interface Dish {
  id: string
  branch_id: string
  name_vi: string
  name_en: string | null
  is_active: boolean
  created_at: string
}

export interface RecipeLine {
  id: string
  dish_id: string
  item_id: string
  qty_per_serving: number | string
}

export interface Table {
  id: string
  branch_id: string
  label: string
  section: string | null
  is_active: boolean
}

export interface Order {
  id: string
  branch_id: string
  table_id: string | null
  status: OrderStatus
  created_by: string | null
  created_at: string
  ready_at: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  dish_id: string
  qty: number
}

export interface UserProfile {
  id: string
  branch_id: string
  role: UserRole
  full_name: string | null
}

// Joined types used by UI
export interface OrderWithDetails extends Order {
  order_items: Array<OrderItem & { dish: Pick<Dish, 'name_vi' | 'name_en'> }>
  table: Pick<Table, 'label'>
}

export interface StockLog {
  id: string
  item_id: string
  delta: number | string
  reason: string
  created_by: string | null
  created_at: string
}

export type StockChangeResult = { floored: string[] }

export interface DishWithAvailability extends Dish {
  status: 'available' | 'low' | 'unavailable'
}
