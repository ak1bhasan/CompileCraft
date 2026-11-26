import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

interface ResizeHandleProps {
  orientation: 'vertical' | 'horizontal'
  direction: 1 | -1
  value: number
  min: number
  max: number
  label: string
  testId: string
  className?: string
  onChange: (nextValue: number) => void
  onDragStateChange?: (dragging: boolean) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export default function ResizeHandle({
  orientation,
  direction,
  value,
  min,
  max,
  label,
  testId,
  className = '',
  onChange,
  onDragStateChange,
}: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)
  const latestOnChangeRef = useRef(onChange)
  const latestOnDragStateRef = useRef(onDragStateChange)

  useEffect(() => {
    latestOnChangeRef.current = onChange
    latestOnDragStateRef.current = onDragStateChange
  }, [onChange, onDragStateChange])

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  const isVertical = orientation === 'vertical'

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()

    cleanupRef.current?.()

    const startCoord = isVertical ? event.clientX : event.clientY
    const startValue = value
    const prevUserSelect = document.body.style.userSelect
    const prevCursor = document.body.style.cursor

    setDragging(true)
    latestOnDragStateRef.current?.(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize'

    const onPointerMove = (moveEvent: PointerEvent) => {
      const currentCoord = isVertical ? moveEvent.clientX : moveEvent.clientY
      const delta = (currentCoord - startCoord) * direction
      latestOnChangeRef.current(clamp(startValue + delta, min, max))
    }

    const finishDrag = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)
      document.body.style.userSelect = prevUserSelect
      document.body.style.cursor = prevCursor
      cleanupRef.current = null
      setDragging(false)
      latestOnDragStateRef.current?.(false)
    }

    cleanupRef.current = finishDrag
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16
    let nextValue: number | null = null

    if (isVertical) {
      if (event.key === 'ArrowRight') {
        nextValue = clamp(value + step * direction, min, max)
      } else if (event.key === 'ArrowLeft') {
        nextValue = clamp(value - step * direction, min, max)
      }
    } else if (event.key === 'ArrowDown') {
      nextValue = clamp(value + step * direction, min, max)
    } else if (event.key === 'ArrowUp') {
      nextValue = clamp(value - step * direction, min, max)
    }

    if (event.key === 'Home') {
      nextValue = min
    } else if (event.key === 'End') {
      nextValue = max
    }

    if (nextValue !== null) {
      event.preventDefault()
      onChange(nextValue)
    }
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      data-testid={testId}
      data-dragging={dragging ? 'true' : 'false'}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className={`group relative z-20 shrink-0 select-none focus:outline-none ${
        isVertical
          ? '-mx-[3px] w-1.5 cursor-col-resize items-stretch justify-center'
          : '-my-[3px] h-1.5 cursor-row-resize items-center justify-stretch'
      } flex ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none transition-colors duration-150 ${
          isVertical ? 'h-full w-[2px]' : 'h-[2px] w-full'
        } ${
          dragging
            ? 'bg-[var(--cc-primary)]'
            : 'bg-transparent group-hover:bg-[var(--cc-primary)]/60 group-focus-visible:bg-[var(--cc-primary)]'
        }`}
      />
    </div>
  )
}
