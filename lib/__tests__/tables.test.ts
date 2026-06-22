import { describe, it, expect } from 'vitest'
import { isTakeoutTable, getTableNumber, getFloorNumber, groupTablesByFloor, getNextTableLabel } from '../tables'
import type { Table } from '../types'

const baseTable = { branch_id: '', section: null, is_active: true }
const takeout: Table = { ...baseTable, id: 't-takeout', label: 'Mang về' }
const table1: Table = { ...baseTable, id: 't-1', label: 'Bàn 1' }
const table2: Table = { ...baseTable, id: 't-2', label: 'Bàn 2' }
const table10: Table = { ...baseTable, id: 't-10', label: 'Bàn 10' }
const table11: Table = { ...baseTable, id: 't-11', label: 'Bàn 11' }

describe('isTakeoutTable', () => {
  it('matches the exact "Mang về" label', () => {
    expect(isTakeoutTable(takeout)).toBe(true)
  })

  it('does not match a numbered table', () => {
    expect(isTakeoutTable(table1)).toBe(false)
  })
})

describe('getTableNumber', () => {
  it('parses the number out of a "Bàn N" label', () => {
    expect(getTableNumber(table1)).toBe(1)
    expect(getTableNumber(table10)).toBe(10)
  })

  it('returns null for a label that does not match the pattern', () => {
    expect(getTableNumber(takeout)).toBeNull()
  })
})

describe('getFloorNumber', () => {
  it('tables 1-10 are floor 1', () => {
    expect(getFloorNumber(1)).toBe(1)
    expect(getFloorNumber(10)).toBe(1)
  })

  it('tables 11-20 are floor 2', () => {
    expect(getFloorNumber(11)).toBe(2)
    expect(getFloorNumber(20)).toBe(2)
  })

  it('tables 21-30 are floor 3', () => {
    expect(getFloorNumber(21)).toBe(3)
  })
})

describe('groupTablesByFloor', () => {
  it('separates the takeout table and groups the rest by floor, sorted numerically', () => {
    const result = groupTablesByFloor([table11, takeout, table2, table1, table10])
    expect(result.takeout).toEqual(takeout)
    expect(result.floors).toEqual([
      { floor: 1, tables: [table1, table2, table10] },
      { floor: 2, tables: [table11] },
    ])
  })

  it('returns a null takeout when no "Mang về" table exists', () => {
    const result = groupTablesByFloor([table1])
    expect(result.takeout).toBeNull()
  })

  it('ignores a table whose label does not match the numbered pattern (other than takeout)', () => {
    const weird: Table = { ...baseTable, id: 't-weird', label: 'Sân vườn' }
    const result = groupTablesByFloor([table1, weird])
    expect(result.floors).toEqual([{ floor: 1, tables: [table1] }])
  })
})

describe('getNextTableLabel', () => {
  it('returns "Bàn 1" when there are no numbered tables yet', () => {
    expect(getNextTableLabel([takeout])).toBe('Bàn 1')
  })

  it('returns one past the highest existing table number when there is no gap', () => {
    expect(getNextTableLabel([table1, table2, takeout])).toBe('Bàn 3')
  })

  it('fills the lowest gap left by a deleted table instead of always going past the max', () => {
    expect(getNextTableLabel([table2, table10])).toBe('Bàn 1')
  })

  it('does not reuse a number still held by a merely-deactivated table', () => {
    const inactiveTable1: Table = { ...table1, is_active: false }
    expect(getNextTableLabel([inactiveTable1, table2])).toBe('Bàn 3')
  })
})
