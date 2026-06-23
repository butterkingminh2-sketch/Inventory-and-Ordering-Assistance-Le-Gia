'use client'

import { useLanguage } from '@/lib/language-context'

interface Props {
  vi: string
  en: string
  className?: string
}

/**
 * Drop-in replacement for the old two-line "VI primary + EN subtitle"
 * stack — renders one line, in whichever language is currently selected,
 * at whatever size className specifies (normally the old primary label's
 * classes; the subtitle's classes are no longer needed once only one line
 * renders).
 */
export function BilingualText({ vi, en, className }: Props) {
  const { t } = useLanguage()
  return <span className={className}>{t(vi, en)}</span>
}
