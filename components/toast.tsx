'use client'

import { useEffect, useState } from 'react'

type Tone = 'error' | 'info'

const TONE_CLASSES: Record<Tone, string> = {
  error: 'bg-error text-on-error',
  info: 'bg-primary text-on-primary',
}

interface Props {
  message: string | null
  tone?: Tone
  /** Tailwind top-offset class — lets two Toasts coexist on the same page without overlapping. */
  topClassName?: string
}

/** Stays mounted through its exit animation — clearing `message` doesn't unmount it instantly. */
export function Toast({ message, tone = 'error', topClassName = 'top-4' }: Props) {
  const [displayMessage, setDisplayMessage] = useState(message)
  const [visible, setVisible] = useState(!!message)
  const [prevMessage, setPrevMessage] = useState(message)

  // Adjusting state in response to a prop change, during render rather than
  // in an effect — React's documented pattern for this, avoids an extra
  // render-then-effect round trip. Uses state (not a ref) to track the
  // previous value, since mutating a ref during render isn't safe.
  if (message !== prevMessage) {
    setPrevMessage(message)
    if (message) {
      setDisplayMessage(message)
      setVisible(true)
    } else {
      setVisible(false)
    }
  }

  useEffect(() => {
    if (visible || !displayMessage) return
    const timeout = setTimeout(() => setDisplayMessage(null), 250)
    return () => clearTimeout(timeout)
  }, [visible, displayMessage])

  if (!displayMessage) return null

  return (
    <div
      className={`fixed ${topClassName} left-1/2 ${TONE_CLASSES[tone]} text-label-vi font-bold px-stack-lg py-2 rounded-xl z-50 shadow-lg flex items-center gap-2 ${
        visible ? 'animate-toast-in' : 'animate-toast-out'
      }`}
    >
      {tone === 'info' && (
        <span className="material-symbols-outlined text-[20px]" aria-hidden>notifications_active</span>
      )}
      {displayMessage}
    </div>
  )
}
