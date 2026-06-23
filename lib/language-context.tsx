'use client'

import { createContext, useContext, useState } from 'react'
import { createClient } from './supabase/client'
import { pickLabel } from './language'
import type { Language } from './types'

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (vi: string, en: string) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'vi',
  setLanguage: () => {},
  t: (vi: string) => vi,
})

export function useLanguage() {
  return useContext(LanguageContext)
}

interface Props {
  initialLanguage: Language
  userId: string
  children: React.ReactNode
}

export function LanguageProvider({ initialLanguage, userId, children }: Props) {
  const [language, setLanguageState] = useState<Language>(initialLanguage)

  function setLanguage(next: Language) {
    setLanguageState(next)
    const supabase = createClient()
    // Fire-and-forget — a low-stakes preference, not order/stock data. If
    // this fails silently, the next successful toggle (or the next login,
    // which would just read the prior value back) is the natural recovery.
    void supabase.from('user_profiles').update({ language: next }).eq('id', userId)
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: (vi, en) => pickLabel(language, vi, en) }}>
      {children}
    </LanguageContext.Provider>
  )
}
