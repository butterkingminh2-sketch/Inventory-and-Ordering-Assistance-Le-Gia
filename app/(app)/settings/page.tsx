'use client'

import { useEffect, useState, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BranchContext } from '../app-shell'
import type { Item, Dish, RecipeLine, Table } from '@/lib/types'

type Tab = 'items' | 'dishes' | 'recipes' | 'tables'

export default function SettingsPage() {
  const { branchId } = useContext(BranchContext)
  const [tab, setTab] = useState<Tab>('items')
  const supabase = createClient()

  const [items, setItems]     = useState<Item[]>([])
  const [dishes, setDishes]   = useState<Dish[]>([])
  const [recipes, setRecipes] = useState<RecipeLine[]>([])
  const [tables, setTables]   = useState<Table[]>([])

  const [newItem,  setNewItem]  = useState({ name_vi: '', name_en: '', unit: '', low_threshold: 3 })
  const [newDish,  setNewDish]  = useState({ name_vi: '', name_en: '', price: 0 })
  const [newLine,  setNewLine]  = useState({ item_id: '', qty_per_serving: 1 })
  const [newTable, setNewTable] = useState({ label: '', section: '' })
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [i, d, r, t] = await Promise.all([
        supabase.from('items').select('*').eq('branch_id', branchId).order('name_vi'),
        supabase.from('dishes').select('*').eq('branch_id', branchId).order('name_vi'),
        supabase.from('recipe_lines').select('*'),
        supabase.from('tables').select('*').eq('branch_id', branchId).order('label'),
      ])
      if (i.data) setItems(i.data)
      if (d.data) setDishes(d.data)
      if (r.data) setRecipes(r.data)
      if (t.data) setTables(t.data)
    }
    load()
  }, [branchId])

  // Items
  async function addItem() {
    if (!newItem.name_vi.trim()) return
    const { data } = await supabase.from('items')
      .insert({ ...newItem, branch_id: branchId, quantity: 0 }).select().single()
    if (data) { setItems(p => [...p, data]); setNewItem({ name_vi: '', name_en: '', unit: '', low_threshold: 3 }) }
  }
  async function deactivateItem(id: string) {
    await supabase.from('items').update({ is_active: false }).eq('id', id)
    setItems(p => p.map(i => i.id === id ? { ...i, is_active: false } : i))
  }
  async function updateItem(id: string, field: string, value: string | number) {
    await supabase.from('items').update({ [field]: value }).eq('id', id)
    setItems(p => p.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  // Dishes
  async function addDish() {
    if (!newDish.name_vi.trim()) return
    const { data } = await supabase.from('dishes')
      .insert({ ...newDish, branch_id: branchId }).select().single()
    if (data) { setDishes(p => [...p, data]); setNewDish({ name_vi: '', name_en: '', price: 0 }) }
  }

  async function updateDishPrice(id: string, price: number) {
    await supabase.from('dishes').update({ price }).eq('id', id)
    setDishes(p => p.map(d => d.id === id ? { ...d, price } : d))
  }

  async function deactivateDish(id: string) {
    await supabase.from('dishes').update({ is_active: false }).eq('id', id)
    setDishes(p => p.map(d => d.id === id ? { ...d, is_active: false } : d))
  }

  // Recipes
  async function addRecipeLine() {
    if (!selectedDishId || !newLine.item_id) return
    const { data } = await supabase.from('recipe_lines')
      .insert({ dish_id: selectedDishId, item_id: newLine.item_id, qty_per_serving: newLine.qty_per_serving })
      .select().single()
    if (data) { setRecipes(p => [...p, data]); setNewLine({ item_id: '', qty_per_serving: 1 }) }
  }
  async function deleteRecipeLine(id: string) {
    await supabase.from('recipe_lines').delete().eq('id', id)
    setRecipes(p => p.filter(r => r.id !== id))
  }
  async function updateRecipeQty(id: string, qty: number) {
    await supabase.from('recipe_lines').update({ qty_per_serving: qty }).eq('id', id)
    setRecipes(p => p.map(r => r.id === id ? { ...r, qty_per_serving: qty } : r))
  }

  // Tables
  async function addTable() {
    if (!newTable.label.trim()) return
    const { data } = await supabase.from('tables')
      .insert({ label: newTable.label, section: newTable.section || null, branch_id: branchId }).select().single()
    if (data) { setTables(p => [...p, data]); setNewTable({ label: '', section: '' }) }
  }
  async function deactivateTable(id: string) {
    await supabase.from('tables').update({ is_active: false }).eq('id', id)
    setTables(p => p.map(t => t.id === id ? { ...t, is_active: false } : t))
  }
  async function updateTableLabel(id: string, label: string) {
    await supabase.from('tables').update({ label }).eq('id', id)
    setTables(p => p.map(t => t.id === id ? { ...t, label } : t))
  }

  const TABS: { key: Tab; labelVi: string }[] = [
    { key: 'items',   labelVi: 'Nguyên liệu' },
    { key: 'dishes',  labelVi: 'Món ăn' },
    { key: 'recipes', labelVi: 'Công thức' },
    { key: 'tables',  labelVi: 'Bàn' },
  ]

  const inputCls = 'border border-outline-variant rounded-lg px-3 py-2 text-label-vi bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary min-h-touch-target-min'
  const btnPrimary = 'bg-primary text-on-primary rounded-lg px-4 font-bold text-label-vi min-h-touch-target-min hover:bg-primary-container transition-colors'
  const btnDanger = 'text-error text-label-en font-bold hover:underline'
  const badgeActive = 'text-label-en px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container'
  const badgeInactive = 'text-label-en px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant'

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-headline-md font-bold text-on-surface mb-stack-lg">
        Cài đặt <span className="text-label-en font-normal text-on-surface-variant">/ Settings</span>
      </h1>

      {/* Tab bar */}
      <div className="flex border-b border-outline-variant mb-stack-lg overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-3 text-label-vi font-bold whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'
            }`}>
            {t.labelVi}
          </button>
        ))}
      </div>

      {/* Items */}
      {tab === 'items' && (
        <div className="space-y-stack-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input placeholder="Tên (VI) *" value={newItem.name_vi}
              onChange={e => setNewItem(p => ({ ...p, name_vi: e.target.value }))}
              className={`${inputCls} col-span-2 md:col-span-1`} />
            <input placeholder="Name (EN)" value={newItem.name_en}
              onChange={e => setNewItem(p => ({ ...p, name_en: e.target.value }))}
              className={inputCls} />
            <input placeholder="Đơn vị" value={newItem.unit}
              onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))}
              className={inputCls} />
            <input type="number" placeholder="Ngưỡng thấp" value={newItem.low_threshold}
              onChange={e => setNewItem(p => ({ ...p, low_threshold: +e.target.value }))}
              className={inputCls} />
            <button onClick={addItem} className={`${btnPrimary} col-span-2 md:col-span-4`}>
              + Thêm nguyên liệu
            </button>
          </div>
          <table className="w-full text-label-vi">
            <thead><tr className="text-left text-on-surface-variant border-b border-outline-variant">
              <th className="pb-2">Tên</th><th className="pb-2">Đơn vị</th>
              <th className="pb-2">Ngưỡng</th><th className="pb-2">Trạng thái</th><th />
            </tr></thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-outline-variant last:border-0">
                  <td className="py-2">
                    <div className="font-bold">{item.name_vi}</div>
                    {item.name_en && <div className="text-label-en text-on-surface-variant">{item.name_en}</div>}
                  </td>
                  <td className="py-2"><input value={item.unit}
                    onChange={e => updateItem(item.id, 'unit', e.target.value)}
                    className="border border-outline-variant rounded px-2 py-1 w-20 text-label-en" /></td>
                  <td className="py-2"><input type="number" value={Number(item.low_threshold)}
                    onChange={e => updateItem(item.id, 'low_threshold', +e.target.value)}
                    className="border border-outline-variant rounded px-2 py-1 w-16 text-label-en" /></td>
                  <td className="py-2">
                    <span className={item.is_active ? badgeActive : badgeInactive}>
                      {item.is_active ? 'Hoạt động' : 'Tắt'}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {item.is_active && <button onClick={() => deactivateItem(item.id)} className={btnDanger}>Tắt</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dishes */}
      {tab === 'dishes' && (
        <div className="space-y-stack-lg">
          <div className="flex gap-2">
            <input placeholder="Tên món (VI) *" value={newDish.name_vi}
              onChange={e => setNewDish(p => ({ ...p, name_vi: e.target.value }))}
              className={`flex-1 ${inputCls}`} />
            <input placeholder="Name (EN)" value={newDish.name_en}
              onChange={e => setNewDish(p => ({ ...p, name_en: e.target.value }))}
              className={`flex-1 ${inputCls}`} />
            <input type="number" placeholder="Giá (đ)" value={newDish.price}
              onChange={e => setNewDish(p => ({ ...p, price: +e.target.value }))}
              className={`w-28 ${inputCls}`} />
            <button onClick={addDish} className={btnPrimary}>+ Thêm</button>
          </div>
          <ul className="divide-y divide-outline-variant">
            {dishes.map(dish => (
              <li key={dish.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-on-surface">{dish.name_vi}</p>
                  {dish.name_en && <p className="text-label-en text-on-surface-variant">{dish.name_en}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <input type="number" value={Number(dish.price)}
                    onChange={e => updateDishPrice(dish.id, +e.target.value)}
                    className="border border-outline-variant rounded px-2 py-1 w-24 text-label-en" />
                  <span className={dish.is_active ? badgeActive : badgeInactive}>
                    {dish.is_active ? 'Hoạt động' : 'Tắt'}
                  </span>
                  {dish.is_active && <button onClick={() => deactivateDish(dish.id)} className={btnDanger}>Tắt</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recipes */}
      {tab === 'recipes' && (
        <div className="space-y-stack-lg">
          <div>
            <label className="text-label-vi font-bold text-on-surface block mb-1">Chọn món ăn</label>
            <select value={selectedDishId ?? ''} onChange={e => setSelectedDishId(e.target.value || null)}
              className={`w-full ${inputCls}`}>
              <option value="">-- Chọn món --</option>
              {dishes.filter(d => d.is_active).map(d => (
                <option key={d.id} value={d.id}>{d.name_vi}</option>
              ))}
            </select>
          </div>
          {selectedDishId && (
            <>
              <ul className="divide-y divide-outline-variant">
                {recipes.filter(r => r.dish_id === selectedDishId).map(r => {
                  const item = items.find(i => i.id === r.item_id)
                  return (
                    <li key={r.id} className="py-2 flex items-center gap-3">
                      <span className="flex-1 text-label-vi text-on-surface">{item?.name_vi ?? r.item_id}</span>
                      <input type="number" value={Number(r.qty_per_serving)} min={0.5} step={0.5}
                        onChange={e => updateRecipeQty(r.id, +e.target.value)}
                        className="border border-outline-variant rounded px-2 py-1 w-20 text-label-en" />
                      <span className="text-label-en text-on-surface-variant w-12">{item?.unit}</span>
                      <button onClick={() => deleteRecipeLine(r.id)} className={btnDanger}>Xóa</button>
                    </li>
                  )
                })}
              </ul>
              <div className="flex gap-2">
                <select value={newLine.item_id} onChange={e => setNewLine(p => ({ ...p, item_id: e.target.value }))}
                  className={`flex-1 ${inputCls}`}>
                  <option value="">-- Chọn nguyên liệu --</option>
                  {items.filter(i => i.is_active).map(i => (
                    <option key={i.id} value={i.id}>{i.name_vi}</option>
                  ))}
                </select>
                <input type="number" value={newLine.qty_per_serving} min={0.5} step={0.5}
                  onChange={e => setNewLine(p => ({ ...p, qty_per_serving: +e.target.value }))}
                  className={`w-20 ${inputCls}`} />
                <button onClick={addRecipeLine} className={btnPrimary}>+ Thêm</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tables */}
      {tab === 'tables' && (
        <div className="space-y-stack-lg">
          <div className="flex gap-2">
            <input placeholder="Tên bàn (Bàn 1, Mang về...)" value={newTable.label}
              onChange={e => setNewTable(p => ({ ...p, label: e.target.value }))}
              className={`flex-1 ${inputCls}`} />
            <input placeholder="Khu vực (Tầng 1...)" value={newTable.section}
              onChange={e => setNewTable(p => ({ ...p, section: e.target.value }))}
              className={`w-32 ${inputCls}`} />
            <button onClick={addTable} className={btnPrimary}>+ Thêm</button>
          </div>
          <ul className="divide-y divide-outline-variant">
            {tables.map(t => (
              <li key={t.id} className="py-2 flex items-center gap-3">
                <input value={t.label} onChange={e => updateTableLabel(t.id, e.target.value)}
                  className={`flex-1 ${inputCls}`} />
                <span className={t.is_active ? badgeActive : badgeInactive}>
                  {t.is_active ? 'Hoạt động' : 'Tắt'}
                </span>
                {t.is_active && <button onClick={() => deactivateTable(t.id)} className={btnDanger}>Tắt</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
