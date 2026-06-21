import { describe, it, expect } from 'vitest'
import { aggregateQuantities } from '../order-lines'
import type { OrderLine } from '../order-lines'

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
