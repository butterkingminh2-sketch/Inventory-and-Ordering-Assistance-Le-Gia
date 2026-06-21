'use client'

import { useEffect, useState, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BranchContext } from '../app-shell'
import type { Item, Dish, RecipeLine, Table, ItemUnit } from '@/lib/types'
import { ITEM_UNITS } from '@/lib/types'
import { QuantityInput } from '@/components/quantity-input'
import { groupTablesByFloor, getNextTableLabel } from '@/lib/tables'

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
  const [newDish,  setNewDish]  = useState({ name_vi: '', name_en: '', price: 0, category: '', is_topping: false })
  const [newDishImage, setNewDishImage] = useState<File | null>(null)
  const [newLine,  setNewLine]  = useState({ item_id: '', qty_per_serving: 1 })
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
    if (!newItem.name_vi.trim() || !newItem.unit) return
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
  async function uploadDishImage(file: File): Promise<string> {
    const ext = file.name.split('.').pop()
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('dish-images').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('dish-images').getPublicUrl(path)
    return data.publicUrl
  }

  async function addDish() {
    if (!newDish.name_vi.trim()) return

    let image_url: string | null = null
    if (newDishImage) {
      try {
        image_url = await uploadDishImage(newDishImage)
      } catch {
        alert('Không thể tải ảnh lên. Món ăn sẽ được lưu không có ảnh.')
      }
    }

    const { data } = await supabase.from('dishes')
      .insert({ ...newDish, category: newDish.category || null, branch_id: branchId, image_url })
      .select().single()
    if (data) {
      setDishes(p => [...p, data])
      setNewDish({ name_vi: '', name_en: '', price: 0, category: '', is_topping: false })
      setNewDishImage(null)
    }
  }

  async function updateDishIsTopping(id: string, is_topping: boolean) {
    await supabase.from('dishes').update({ is_topping }).eq('id', id)
    setDishes(p => p.map(d => d.id === id ? { ...d, is_topping } : d))
  }

  async function updateDishPrice(id: string, price: number) {
    await supabase.from('dishes').update({ price }).eq('id', id)
    setDishes(p => p.map(d => d.id === id ? { ...d, price } : d))
  }

  async function updateDishCategory(id: string, category: string) {
    await supabase.from('dishes').update({ category: category || null }).eq('id', id)
    setDishes(p => p.map(d => d.id === id ? { ...d, category: category || null } : d))
  }

  async function updateDishImage(id: string, file: File) {
    try {
      const image_url = await uploadDishImage(file)
      await supabase.from('dishes').update({ image_url }).eq('id', id)
      setDishes(p => p.map(d => d.id === id ? { ...d, image_url } : d))
    } catch {
      alert('Không thể tải ảnh lên. Vui lòng thử lại.')
    }
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
    const label = getNextTableLabel(tables)
    const { data } = await supabase.from('tables')
      .insert({ label, branch_id: branchId }).select().single()
    if (data) setTables(p => [...p, data])
  }
  async function deactivateTable(id: string) {
    await supabase.from('tables').update({ is_active: false }).eq('id', id)
    setTables(p => p.map(t => t.id === id ? { ...t, is_active: false } : t))
  }

  const TABS: { key: Tab; labelVi: string }[] = [
    { key: 'items',   labelVi: 'Nguyên liệu' },
    { key: 'dishes',  labelVi: 'Món ăn' },
    { key: 'recipes', labelVi: 'Công thức' },
    { key: 'tables',  labelVi: 'Bàn' },
  ]

  const { takeout: takeoutTable, floors: floorGroups } = groupTablesByFloor(tables)

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
            <select value={newItem.unit}
              onChange={e => setNewItem(p => ({ ...p, unit: e.target.value as ItemUnit }))}
              className={inputCls}>
              <option value="">-- Đơn vị --</option>
              {ITEM_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
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
                  <td className="py-2"><select value={item.unit}
                    onChange={e => updateItem(item.id, 'unit', e.target.value)}
                    className="border border-outline-variant rounded px-2 py-1 w-20 text-label-en">
                    {ITEM_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select></td>
                  <td className="py-2">
                    <QuantityInput
                      value={Number(item.low_threshold)}
                      unit={item.unit}
                      onConfirm={newValue => updateItem(item.id, 'low_threshold', newValue)}
                      onCancel={() => {}}
                    />
                  </td>
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
          <div className="flex flex-wrap gap-2">
            <input placeholder="Tên món (VI) *" value={newDish.name_vi}
              onChange={e => setNewDish(p => ({ ...p, name_vi: e.target.value }))}
              className={`flex-1 ${inputCls}`} />
            <input placeholder="Name (EN)" value={newDish.name_en}
              onChange={e => setNewDish(p => ({ ...p, name_en: e.target.value }))}
              className={`flex-1 ${inputCls}`} />
            <input placeholder="Phân loại" value={newDish.category}
              onChange={e => setNewDish(p => ({ ...p, category: e.target.value }))}
              className={`w-28 ${inputCls}`} />
            <input type="number" placeholder="Giá (đ)" value={newDish.price} min={0}
              onChange={e => setNewDish(p => ({ ...p, price: +e.target.value || 0 }))}
              className={`w-28 ${inputCls}`} />
            <input type="file" accept="image/*"
              onChange={e => setNewDishImage(e.target.files?.[0] ?? null)}
              className="text-label-en" />
            <label className="flex items-center gap-1 text-label-en text-on-surface-variant">
              <input type="checkbox" checked={newDish.is_topping}
                onChange={e => setNewDish(p => ({ ...p, is_topping: e.target.checked }))} />
              Món gọi thêm
            </label>
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
                  <input placeholder="Phân loại" value={dish.category ?? ''}
                    onChange={e => updateDishCategory(dish.id, e.target.value)}
                    className="border border-outline-variant rounded px-2 py-1 w-24 text-label-en" />
                  <input type="number" value={Number(dish.price)} min={0}
                    onChange={e => updateDishPrice(dish.id, +e.target.value || 0)}
                    className="border border-outline-variant rounded px-2 py-1 w-24 text-label-en" />
                  <label className="text-label-en text-primary font-bold cursor-pointer">
                    Đổi ảnh
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) updateDishImage(dish.id, f) }} />
                  </label>
                  <label className="flex items-center gap-1 text-label-en text-on-surface-variant">
                    <input type="checkbox" checked={dish.is_topping}
                      onChange={e => updateDishIsTopping(dish.id, e.target.checked)} />
                    Gọi thêm
                  </label>
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
          <button onClick={addTable} className={`${btnPrimary} w-full`}>
            + Thêm {getNextTableLabel(tables)}
          </button>

          {takeoutTable && (
            <div className="rounded-xl border-2 border-primary bg-primary-fixed p-stack-md flex items-center justify-between">
              <span className="font-bold text-on-surface">{takeoutTable.label}</span>
              <div className="flex items-center gap-3">
                <span className={takeoutTable.is_active ? badgeActive : badgeInactive}>
                  {takeoutTable.is_active ? 'Hoạt động' : 'Tắt'}
                </span>
                {takeoutTable.is_active && (
                  <button onClick={() => deactivateTable(takeoutTable.id)} className={btnDanger}>Tắt</button>
                )}
              </div>
            </div>
          )}

          {floorGroups.map(group => (
            <div key={group.floor}>
              <p className="text-label-en font-bold text-on-surface-variant uppercase mb-2">Tầng {group.floor}</p>
              <ul className="divide-y divide-outline-variant">
                {group.tables.map(t => (
                  <li key={t.id} className="py-2 flex items-center justify-between gap-3">
                    <span className="text-label-vi text-on-surface">{t.label}</span>
                    <div className="flex items-center gap-3">
                      <span className={t.is_active ? badgeActive : badgeInactive}>
                        {t.is_active ? 'Hoạt động' : 'Tắt'}
                      </span>
                      {t.is_active && <button onClick={() => deactivateTable(t.id)} className={btnDanger}>Tắt</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
