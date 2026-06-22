'use client'

import { useEffect, useState } from 'react'

interface Props {
  message: string | null
}

/** Stays mounted through its exit animation — clearing `message` doesn't unmount it instantly. */
export function Toast({ message }: Props) {
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
      className={`fixed top-4 left-1/2 bg-error text-on-error text-label-vi font-bold px-stack-lg py-2 rounded-xl z-50 shadow-lg ${
        visible ? 'animate-toast-in' : 'animate-toast-out'
      }`}
    >
      {displayMessage}
    </div>
  )
}
