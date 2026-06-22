'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  count: number
  className: string
}

/** A small numeric badge that briefly bumps in size whenever count changes. */
export function CountBadge({ count, className }: Props) {
  const prevCountRef = useRef(count)
  const [bump, setBump] = useState(false)

  useEffect(() => {
    if (prevCountRef.current !== count) {
      prevCountRef.current = count
      setBump(true)
      const timeout = setTimeout(() => setBump(false), 400)
      return () => clearTimeout(timeout)
    }
  }, [count])

  return (
    <span className={`${className} ${bump ? 'animate-badge-bump' : ''}`}>
      {count}
    </span>
  )
}
