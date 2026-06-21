'use client'

import { useState } from 'react'
import { BIGGER_UNIT, toCanonical, fromCanonical } from '@/lib/unit-conversion'
import type { ItemUnit } from '@/lib/types'

interface Props {
  value: number
  unit: ItemUnit
  onConfirm: (newCanonicalValue: number) => void
  onCancel: () => void
  autoFocus?: boolean
  inputClassName?: string
}

const defaultInputClassName =
  'w-20 border border-outline-variant rounded-lg px-2 py-1 text-label-en bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary'

export function QuantityInput({ value, unit, onConfirm, onCancel, autoFocus, inputClassName }: Props) {
  const bigger = BIGGER_UNIT[unit]
  const [useBigger, setUseBigger] = useState(false)
  const [text, setText] = useState(String(fromCanonical(value, unit, false)))

  function resetText(nextUseBigger: boolean) {
    setText(String(fromCanonical(value, unit, nextUseBigger)))
  }

  function handleToggle() {
    const next = !useBigger
    setUseBigger(next)
    resetText(next)
  }

  function handleConfirm() {
    const parsed = parseFloat(text)
    if (!Number.isFinite(parsed) || parsed < 0) {
      resetText(useBigger)
      onCancel()
      return
    }
    onConfirm(toCanonical(parsed, unit, useBigger))
  }

  function handleCancel() {
    resetText(useBigger)
    onCancel()
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        value={text}
        autoFocus={autoFocus}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleConfirm()
          if (e.key === 'Escape') handleCancel()
        }}
        onBlur={handleConfirm}
        className={inputClassName ?? defaultInputClassName}
      />
      {bigger ? (
        <button
          type="button"
          onClick={handleToggle}
          className="text-label-en px-2 py-1 rounded-full bg-surface-container text-on-surface-variant font-bold"
        >
          {useBigger ? bigger.unit : unit}
        </button>
      ) : (
        <span className="text-label-en text-on-surface-variant">{unit}</span>
      )}
    </div>
  )
}
