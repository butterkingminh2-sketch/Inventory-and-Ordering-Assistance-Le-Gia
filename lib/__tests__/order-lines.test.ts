import { describe, it, expect } from 'vitest'
import { aggregateQuantities, linesFromOrderItems, groupIdenticalLines } from '../order-lines'
import type { OrderLine } from '../order-lines'
import type { OrderItem } from '../types'

describe('aggregateQuantities', () => {
  it('returns an empty record for no lines', () => {
    expect(aggregateQuantities([])).toEqual({})
  })

  it('counts one line as 1 of its dish', () => {
    const lines: OrderLine[] = [{ id: 'l1', dishId: 'dish-a', toppings: {}, note: '' }]
    expect(aggregateQuantities(lines)).toEqual({ 'dish-a': 1 })
  })

  it('sums multiple lines of the same dish', () => {
    const lines: OrderLine[] = [
      { id: 'l1', dishId: 'dish-a', toppings: {}, note: '' },
      { id: 'l2', dishId: 'dish-a', toppings: {}, note: '' },
    ]
    expect(aggregateQuantities(lines)).toEqual({ 'dish-a': 2 })
  })

  it('adds topping quantities into the same pool as their own dish entries', () => {
    const lines: OrderLine[] = [
      { id: 'l1', dishId: 'dish-a', toppings: { 'dish-topping': 1 }, note: '' },
      { id: 'l2', dishId: 'dish-topping', toppings: {}, note: '' },
    ]
    // dish-topping ordered once standalone (l2) + once as a topping inside l1 = 2 total
    expect(aggregateQuantities(lines)).toEqual({ 'dish-a': 1, 'dish-topping': 2 })
  })

  it('sums multiple toppings within one line and across lines', () => {
    const lines: OrderLine[] = [
      { id: 'l1', dishId: 'dish-a', toppings: { 'dish-t1': 2, 'dish-t2': 1 }, note: '' },
      { id: 'l2', dishId: 'dish-b', toppings: { 'dish-t1': 1 }, note: '' },
    ]
    expect(aggregateQuantities(lines)).toEqual({
      'dish-a': 1,
      'dish-b': 1,
      'dish-t1': 3,
      'dish-t2': 1,
    })
  })
})

describe('linesFromOrderItems', () => {
  it('returns one line per root item (no parent_item_id), with empty toppings', () => {
    const items: OrderItem[] = [
      { id: 'oi-1', order_id: 'o1', dish_id: 'dish-a', qty: 1, price_at_order: 45000, note: null, parent_item_id: null, comped: false },
    ]
    expect(linesFromOrderItems(items)).toEqual([
      { id: 'oi-1', dishId: 'dish-a', toppings: {}, note: '' },
    ])
  })

  it('nests a child item under its parent as a topping', () => {
    const items: OrderItem[] = [
      { id: 'oi-dish', order_id: 'o1', dish_id: 'dish-a', qty: 1, price_at_order: 45000, note: null, parent_item_id: null, comped: false },
      { id: 'oi-topping', order_id: 'o1', dish_id: 'dish-topping', qty: 2, price_at_order: 10000, note: null, parent_item_id: 'oi-dish', comped: false },
    ]
    expect(linesFromOrderItems(items)).toEqual([
      { id: 'oi-dish', dishId: 'dish-a', toppings: { 'dish-topping': 2 }, note: '' },
    ])
  })

  it('carries a non-null note through to the line', () => {
    const items: OrderItem[] = [
      { id: 'oi-1', order_id: 'o1', dish_id: 'dish-a', qty: 1, price_at_order: 45000, note: 'không hành', parent_item_id: null, comped: false },
    ]
    expect(linesFromOrderItems(items)[0].note).toBe('không hành')
  })

  it('keeps separate root items as separate lines even when they share a dish_id', () => {
    const items: OrderItem[] = [
      { id: 'oi-1', order_id: 'o1', dish_id: 'dish-a', qty: 1, price_at_order: 45000, note: null, parent_item_id: null, comped: false },
      { id: 'oi-2', order_id: 'o1', dish_id: 'dish-a', qty: 1, price_at_order: 45000, note: null, parent_item_id: null, comped: false },
    ]
    expect(linesFromOrderItems(items)).toHaveLength(2)
  })
})

describe('groupIdenticalLines', () => {
  it('merges lines with the same dish, note, and toppings into one with a summed qty', () => {
    const lines: OrderLine[] = [
      { id: 'l1', dishId: 'dish-a', toppings: {}, note: '' },
      { id: 'l2', dishId: 'dish-a', toppings: {}, note: '' },
      { id: 'l3', dishId: 'dish-a', toppings: {}, note: '' },
    ]
    expect(groupIdenticalLines(lines)).toEqual([
      { dishId: 'dish-a', toppings: {}, note: '', qty: 3 },
    ])
  })

  it('keeps lines with different notes separate even when the dish matches', () => {
    const lines: OrderLine[] = [
      { id: 'l1', dishId: 'dish-a', toppings: {}, note: 'không hành' },
      { id: 'l2', dishId: 'dish-a', toppings: {}, note: '' },
    ]
    expect(groupIdenticalLines(lines)).toEqual([
      { dishId: 'dish-a', toppings: {}, note: 'không hành', qty: 1 },
      { dishId: 'dish-a', toppings: {}, note: '', qty: 1 },
    ])
  })

  it('keeps lines with different toppings separate even when the dish matches', () => {
    const lines: OrderLine[] = [
      { id: 'l1', dishId: 'dish-a', toppings: { 'dish-topping': 1 }, note: '' },
      { id: 'l2', dishId: 'dish-a', toppings: {}, note: '' },
    ]
    expect(groupIdenticalLines(lines)).toEqual([
      { dishId: 'dish-a', toppings: { 'dish-topping': 1 }, note: '', qty: 1 },
      { dishId: 'dish-a', toppings: {}, note: '', qty: 1 },
    ])
  })

  it('merges lines whose toppings match regardless of key insertion order', () => {
    const lines: OrderLine[] = [
      { id: 'l1', dishId: 'dish-a', toppings: { 'dish-t1': 1, 'dish-t2': 2 }, note: '' },
      { id: 'l2', dishId: 'dish-a', toppings: { 'dish-t2': 2, 'dish-t1': 1 }, note: '' },
    ]
    expect(groupIdenticalLines(lines)).toEqual([
      { dishId: 'dish-a', toppings: { 'dish-t1': 1, 'dish-t2': 2 }, note: '', qty: 2 },
    ])
  })

  it('keeps different dishes separate', () => {
    const lines: OrderLine[] = [
      { id: 'l1', dishId: 'dish-a', toppings: {}, note: '' },
      { id: 'l2', dishId: 'dish-b', toppings: {}, note: '' },
    ]
    expect(groupIdenticalLines(lines)).toHaveLength(2)
  })

  it('returns an empty array for no lines', () => {
    expect(groupIdenticalLines([])).toEqual([])
  })
})
