import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { IngredientCard } from '../ingredient-card'
import type { Item } from '@/lib/types'

const base: Item = {
  id: 'i1', branch_id: 'b1', name_vi: 'Giò', name_en: 'Pork roll',
  unit: 'phần', quantity: 5, low_threshold: 3, is_active: true, created_at: '',
}

describe('IngredientCard status badge', () => {
  it('shows Đủ when quantity > low_threshold', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} onSetQuantity={() => {}} />)
    expect(screen.getByText('Đủ')).toBeInTheDocument()
  })

  it('shows Sắp hết when 0 < quantity ≤ low_threshold', () => {
    render(<IngredientCard item={{ ...base, quantity: 2 }} onAdjust={() => {}} onSetQuantity={() => {}} />)
    expect(screen.getByText('Sắp hết')).toBeInTheDocument()
  })

  it('shows Hết when quantity = 0', () => {
    render(<IngredientCard item={{ ...base, quantity: 0 }} onAdjust={() => {}} onSetQuantity={() => {}} />)
    expect(screen.getByText('Hết')).toBeInTheDocument()
  })

  it('renders Vietnamese name prominently', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} onSetQuantity={() => {}} />)
    expect(screen.getByText('Giò')).toBeInTheDocument()
  })

  it('renders English subtitle', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} onSetQuantity={() => {}} />)
    expect(screen.getByText('Pork roll')).toBeInTheDocument()
  })

  it('renders quantity and unit', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} onSetQuantity={() => {}} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('phần')).toBeInTheDocument()
  })
})

describe('IngredientCard tap-to-edit', () => {
  it('reveals an editable input when the quantity is tapped', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} onSetQuantity={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sửa số lượng Giò' }))
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  })

  it('calls onSetQuantity with the typed value on confirm', () => {
    let confirmedWith: number | null = null
    render(
      <IngredientCard
        item={base}
        onAdjust={() => {}}
        onSetQuantity={(_id, newQty) => { confirmedWith = newQty }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sửa số lượng Giò' }))
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(confirmedWith).toBe(12)
  })
})
