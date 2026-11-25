import { ChevronDown, ChevronUp } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import EmptyState from '../../components/common/EmptyState'
import type { BottomTabId } from '../../types/ide'

interface BottomPanelProps {
  collapsed: boolean
  onToggle: () => void
  activeTab: BottomTabId
  onTabChange: (tab: BottomTabId) => void
}

const TABS: { id: BottomTabId; label: string }[] = [
  { id: 'output', label: 'Output' },
  { id: 'problems', label: 'Problems' },
  { id: 'terminal', label: 'Terminal' },
]

function panelContent(tab: BottomTabId) {
  switch (tab) {
    case 'output':
      return (
        <EmptyState
          title="No output"
          description="Compiler integration will be available in a later milestone."
        />
      )
    case 'problems':
      return (
        <EmptyState
          title="No problems reported"
          description="Compiler integration will be available in a later milestone."
        />
      )
    case 'terminal':
      return (
        <EmptyState
          title="Terminal not connected"
          description="Local execution via Electron will be added in a later milestone."
        />
      )
  }
}

export default function BottomPanel({
  collapsed,
  onToggle,
  activeTab,
  onTabChange,
}: BottomPanelProps) {
  const onTabListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((tab) => tab.id === activeTab)
    if (index < 0) {
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      onTabChange(TABS[(index + 1) % TABS.length].id)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onTabChange(TABS[(index - 1 + TABS.length) % TABS.length].id)
    } else if (event.key === 'Home') {
      event.preventDefault()
      onTabChange(TABS[0].id)
    } else if (event.key === 'End') {
      event.preventDefault()
      onTabChange(TABS[TABS.length - 1].id)
    }
  }

  return (
    <section
      className={`flex shrink-0 flex-col border-t border-[var(--cc-border)] bg-[var(--cc-surface)] transition-[height] duration-200 ${
        collapsed ? 'h-9' : 'h-44'
      }`}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--cc-border)] px-2">
        <div
          role="tablist"
          aria-label="Console"
          className="flex items-center gap-1 overflow-x-auto"
          onKeyDown={onTabListKeyDown}
        >
          {TABS.map((tab) => {
            const active = tab.id === activeTab
            const tabId = `cc-bottom-tab-${tab.id}`
            const panelId = `cc-bottom-panel-${tab.id}`
            return (
              <button
                key={tab.id}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={panelId}
                tabIndex={active ? 0 : -1}
                onClick={() => {
                  onTabChange(tab.id)
                  if (collapsed) {
                    onToggle()
                  }
                }}
                className={`h-7 shrink-0 rounded-md px-2.5 text-xs transition-colors ${
                  active
                    ? 'bg-[var(--cc-primary)]/20 text-[var(--cc-primary-hover)]'
                    : 'text-[var(--cc-text-muted)] hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--cc-text-muted)] transition-colors hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]"
        >
          {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>
      {!collapsed
        ? TABS.map((tab) => {
            const active = tab.id === activeTab
            return (
              <div
                key={tab.id}
                id={`cc-bottom-panel-${tab.id}`}
                role="tabpanel"
                aria-labelledby={`cc-bottom-tab-${tab.id}`}
                hidden={!active}
                className="min-h-0 flex-1 overflow-auto"
              >
                {active ? panelContent(tab.id) : null}
              </div>
            )
          })
        : null}
    </section>
  )
}
