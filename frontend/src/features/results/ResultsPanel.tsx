import { X } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import type { ResultsTabId } from '../../types/ide'
import TokensPanel from '../lexer/TokensPanel'
import ParserPanel from '../parser/ParserPanel'
import ASTPanel from '../ast/ASTPanel'
import DiagnosticsPanel from '../diagnostics/DiagnosticsPanel'

interface ResultsPanelProps {
  idPrefix: string
  activeTab: ResultsTabId
  onTabChange: (tab: ResultsTabId) => void
  showClose?: boolean
  onClose?: () => void
}

const TABS: { id: ResultsTabId; label: string }[] = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'parser', label: 'Parser' },
  { id: 'ast', label: 'AST' },
  { id: 'diagnostics', label: 'Diagnostics' },
]

function panelContent(tab: ResultsTabId) {
  switch (tab) {
    case 'tokens':
      return <TokensPanel />
    case 'parser':
      return <ParserPanel />
    case 'ast':
      return <ASTPanel />
    case 'diagnostics':
      return <DiagnosticsPanel />
  }
}

export default function ResultsPanel({
  idPrefix,
  activeTab,
  onTabChange,
  showClose = false,
  onClose,
}: ResultsPanelProps) {
  const tabIdFor = (tabId: ResultsTabId) => `${idPrefix}-tab-${tabId}`
  const panelIdFor = (tabId: ResultsTabId) => `${idPrefix}-panel-${tabId}`

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
    <section className="flex h-full min-w-0 flex-col overflow-hidden border-l border-[var(--cc-border)] bg-[var(--cc-surface)]">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--cc-border)] px-1">
        <div
          role="tablist"
          aria-label="Results"
          className="grid min-w-0 flex-1 grid-cols-4 items-center gap-0.5"
          onKeyDown={onTabListKeyDown}
        >
          {TABS.map((tab) => {
            const active = tab.id === activeTab
            const tabId = tabIdFor(tab.id)
            const panelId = panelIdFor(tab.id)
            return (
              <button
                key={tab.id}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={panelId}
                tabIndex={active ? 0 : -1}
                title={tab.label}
                onClick={() => onTabChange(tab.id)}
                className={`flex h-7 min-w-0 items-center justify-center rounded-md px-0.5 text-xs tracking-tight transition-colors ${
                  active
                    ? 'bg-[var(--cc-primary)]/20 text-[var(--cc-primary-hover)]'
                    : 'text-[var(--cc-text-muted)] hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]'
                }`}
              >
                <span className="truncate">{tab.label}</span>
              </button>
            )
          })}
        </div>
        {showClose && onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close results panel"
            title="Close results"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--cc-text-muted)] transition-colors hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]"
          >
            <X size={14} strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {TABS.map((tab) => {
        const active = tab.id === activeTab
        return (
          <div
            key={tab.id}
            id={panelIdFor(tab.id)}
            role="tabpanel"
            aria-labelledby={tabIdFor(tab.id)}
            hidden={!active}
            className="min-h-0 flex-1 overflow-auto"
          >
            {active ? panelContent(tab.id) : null}
          </div>
        )
      })}
    </section>
  )
}
