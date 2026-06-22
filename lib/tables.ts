import type { Table } from './types'

export const TABLES_PER_FLOOR = 10

/** Pure function — no DB calls. */
export function isTakeoutTable(table: Pick<Table, 'label'>): boolean {
  return table.label === 'Mang về'
}

/** Pure function — no DB calls. Parses the number out of a "Bàn N" label, null if it doesn't match. */
export function getTableNumber(table: Pick<Table, 'label'>): number | null {
  const match = table.label.match(/^Bàn (\d+)$/)
  return match ? parseInt(match[1], 10) : null
}

/** Pure function — no DB calls. Tables 1-10 are floor 1, 11-20 are floor 2, and so on — purely derived, never stored. */
export function getFloorNumber(tableNumber: number): number {
  return Math.ceil(tableNumber / TABLES_PER_FLOOR)
}

export interface FloorGroup {
  floor: number
  tables: Table[]
}

/**
 * Pure function — no DB calls. Splits the takeout table out from the rest,
 * then groups the remaining numbered tables by floor, sorted numerically
 * both within each floor and across floors. A table whose label doesn't
 * match the numbered pattern (and isn't takeout) is silently excluded —
 * there's no floor to derive it from.
 */
export function groupTablesByFloor(tables: Table[]): { takeout: Table | null; floors: FloorGroup[] } {
  const takeout = tables.find(isTakeoutTable) ?? null
  const floorMap = new Map<number, Table[]>()

  for (const table of tables) {
    if (isTakeoutTable(table)) continue
    const number = getTableNumber(table)
    if (number === null) continue
    const floor = getFloorNumber(number)
    const list = floorMap.get(floor) ?? []
    list.push(table)
    floorMap.set(floor, list)
  }

  const floors = Array.from(floorMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([floor, floorTables]) => ({
      floor,
      tables: floorTables.sort((a, b) => (getTableNumber(a) ?? 0) - (getTableNumber(b) ?? 0)),
    }))

  return { takeout, floors }
}

/**
 * Pure function — no DB calls. The lowest table number not currently in
 * use by any table, active or inactive — so a merely-deactivated table
 * still holds its number (it might come back), but a number freed by an
 * actual delete becomes available again instead of being gone forever.
 */
export function getNextTableLabel(tables: Table[]): string {
  const numbers = new Set(tables.map(getTableNumber).filter((n): n is number => n !== null))
  let next = 1
  while (numbers.has(next)) next++
  return `Bàn ${next}`
}
