import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { IngredientCard } from '../ingredient-card'
import type { Item } from '@/lib/types'

const base: Item = {
  id: 'i1', branch_id: 'b1', name_vi: 'Giò', name_en: 'Pork roll',
  unit: 'phần', quantity: 5, low_threshold: 3, is_active: true, created_at: '',
}

describe('IngredientCard status badge', () => {
  it('shows Đủ when quantity > low_threshold', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} />)
    expect(screen.getByText('Đủ')).toBeInTheDocument()
  })

  it('shows Sắp hết when 0 < quantity ≤ low_threshold', () => {
    render(<IngredientCard item={{ ...base, quantity: 2 }} onAdjust={() => {}} />)
    expect(screen.getByText('Sắp hết')).toBeInTheDocument()
  })

  it('shows Hết when quantity = 0', () => {
    render(<IngredientCard item={{ ...base, quantity: 0 }} onAdjust={() => {}} />)
    expect(screen.getByText('Hết')).toBeInTheDocument()
  })

  it('renders Vietnamese name prominently', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} />)
    expect(screen.getByText('Giò')).toBeInTheDocument()
  })

  it('renders English subtitle', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} />)
    expect(screen.getByText('Pork roll')).toBeInTheDocument()
  })

  it('renders quantity and unit', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('phần')).toBeInTheDocument()
  })
})
