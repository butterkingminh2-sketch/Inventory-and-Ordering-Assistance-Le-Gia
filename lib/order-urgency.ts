const URGENCY_MS = 5 * 60 * 1000

export function isUrgent(readyAt: string | null): boolean {
  if (!readyAt) return false
  return Date.now() - new Date(readyAt).getTime() >= URGENCY_MS
}

export function elapsedLabel(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'vừa xong'
  return `${minutes} phút trước`
}
