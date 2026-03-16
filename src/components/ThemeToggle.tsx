import React from 'react'
import clsx from 'clsx'
import { Check, ChevronDown, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useTheme, type ThemeMode } from '../lib/theme'

const items: Array<{
  mode: ThemeMode
  icon: LucideIcon
  labelZh: string
  labelEn: string
}> = [
  { mode: 'system', icon: Monitor, labelZh: '系统', labelEn: 'System' },
  { mode: 'light', icon: Sun, labelZh: '明亮', labelEn: 'Light' },
  { mode: 'dark', icon: Moon, labelZh: '深色', labelEn: 'Dark' },
]

export const ThemeToggle: React.FC<{ isZh: boolean; compact?: boolean }> = ({ isZh, compact = false }) => {
  const { mode, resolvedTheme, setMode } = useTheme()
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement | null>(null)

  const activeItem = items.find((item) => item.mode === mode) ?? items[0]
  const ActiveIcon = activeItem.icon

  React.useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={clsx(
          'theme-surface-button inline-flex items-center rounded-full transition',
          compact ? 'h-10 w-10 justify-center' : 'gap-2 px-3.5 py-2 text-sm font-semibold',
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={isZh ? '主题切换' : 'Theme switcher'}
        title={isZh ? '主题切换' : 'Theme switcher'}
      >
        <ActiveIcon size={15} />
        {!compact && <span>{isZh ? activeItem.labelZh : activeItem.labelEn}</span>}
        {!compact && (
          <ChevronDown
            size={14}
            className={clsx('transition-transform duration-200', open && 'rotate-180')}
          />
        )}
      </button>

      <div
        className={clsx(
          'absolute right-0 top-[calc(100%+0.6rem)] z-50 w-44 rounded-[22px] border border-charcoal/10 bg-warm-white/92 p-2 shadow-[0_22px_60px_rgba(39,52,85,0.16)] backdrop-blur-2xl transition duration-150',
          resolvedTheme === 'dark' && 'border-white/10 bg-[rgba(9,14,28,0.92)] shadow-[0_24px_70px_rgba(0,0,0,0.45)]',
          open ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0',
        )}
        role="menu"
        aria-hidden={!open}
      >
        {items.map((item) => {
          const Icon = item.icon
          const active = mode === item.mode

          return (
            <button
              key={item.mode}
              type="button"
              onClick={() => {
                setMode(item.mode)
                setOpen(false)
              }}
              className={clsx(
                'flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition',
                active
                  ? 'theme-contrast-button'
                  : resolvedTheme === 'dark'
                    ? 'text-charcoal/72 hover:bg-white/6 hover:text-charcoal'
                    : 'text-charcoal/66 hover:bg-black/[0.04] hover:text-charcoal',
              )}
              role="menuitemradio"
              aria-checked={active}
            >
              <span className="inline-flex items-center gap-2">
                <Icon size={15} />
                <span>{isZh ? item.labelZh : item.labelEn}</span>
              </span>
              <Check
                size={14}
                className={clsx(
                  'transition-opacity',
                  active ? 'opacity-100' : 'opacity-0',
                )}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
