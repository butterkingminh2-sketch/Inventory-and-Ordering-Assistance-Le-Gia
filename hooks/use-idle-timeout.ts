'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
const WARNING_SECONDS = 30

/**
 * Logs out after `timeoutMinutes` of no mouse/keyboard/touch/scroll
 * activity, showing a countdown warning for the last WARNING_SECONDS so an
 * idle-but-present user isn't surprise-logged-out. Any activity at all
 * (including the warning's own "stay signed in" button) resets the clock.
 */
export function useIdleTimeout(timeoutMinutes: number) {
  const [showWarning, setShowWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(WARNING_SECONDS)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const router = useRouter()

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
  }, [])

  const handleLogout = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }, [router])

  const resetTimers = useCallback(() => {
    clearTimers()
    setShowWarning(false)
    setSecondsLeft(WARNING_SECONDS)

    const warningDelayMs = Math.max(timeoutMinutes * 60_000 - WARNING_SECONDS * 1000, 0)
    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true)
      let remaining = WARNING_SECONDS
      countdownRef.current = setInterval(() => {
        remaining -= 1
        setSecondsLeft(remaining)
      }, 1000)
      logoutTimerRef.current = setTimeout(handleLogout, WARNING_SECONDS * 1000)
    }, warningDelayMs)
  }, [timeoutMinutes, clearTimers, handleLogout])

  useEffect(() => {
    // Starting the idle-detection timers on mount is inherently a side
    // effect with no pure render-time equivalent. The setState calls
    // inside reset the warning state back to its own initial values
    // (a no-op render) before scheduling the real, later state changes
    // via setTimeout — not deriving anything from props/state here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetTimers()
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, resetTimers))
    return () => {
      clearTimers()
      ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, resetTimers))
    }
  }, [resetTimers, clearTimers])

  return { showWarning, secondsLeft, staySignedIn: resetTimers }
}
