const PUBLIC_CHANNEL_RESET_HOUR = 6

/**
 * Pure function — no DB calls. Returns the most recent 6:00:00 AM local time
 * at or before `now`. The public chat channel only shows messages at or
 * after this cutoff — a read-side filter, not a delete job.
 */
export function getPublicChannelCutoff(now: Date): Date {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), PUBLIC_CHANNEL_RESET_HOUR, 0, 0)
  if (now < cutoff) {
    cutoff.setDate(cutoff.getDate() - 1)
  }
  return cutoff
}
