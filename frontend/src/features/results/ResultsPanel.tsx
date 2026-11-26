import { X } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import type { CompileResult, ResultsTabId } from '../../types/ide'
import ASTPanel from '../ast/ASTPanel'
import DiagnosticsPanel from '../diagnostics/DiagnosticsPanel'
import TokensPanel from '../lexer/TokensPanel'
import SymbolTablePanel from './SymbolTablePanel'
import TacPanel from './TacPanel'

interface ResultsPanelProps {
  idPrefix: string
  activeTab: ResultsTabId
  onTabChange: (tab: ResultsTabId) => void
  result: CompileResult | null
  isCompiling: boolean
  onJumpToLine?: (line: number) => void
  showClose?: boolean
  onClose?: () => void
}

const TABS: { id: ResultsTabId; label: string }[] = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'ast', label: 'AST' },
  { id: 'symtab', label: 'Symbol Table' },
  { id: 'tac', label: 'TAC' },
  { id: 'errors', label: 'Errors' },
]

export default function ResultsPanel({
  idPrefix,
  activeTab,
  onTabChange,
  result,
  isCompiling,
  onJumpToLine,
  showClose = false,
  onClose,
}: ResultsPanelProps) {
  const tabIdFor = (tabId: ResultsTabId) => `${idPrefix}-tab-${tabId}`
  const panelIdFor = (tabId: ResultsTabId) => `${idPrefix}-panel-${tabId}`

  const panelContent = (tab: ResultsTabId) => {
    switch (tab) {
      case 'tokens':
        return <TokensPanel result={result} isCompiling={isCompiling} />
      case 'ast':
        return <ASTPanel result={result} isCompiling={isCompiling} />
      case 'symtab':
        return <SymbolTablePanel result={result} isCompiling={isCompiling} />
      case 'tac':
        return <TacPanel result={result} isCompiling={isCompiling} />
      case 'errors':
        return (
          <DiagnosticsPanel
            result={result}
            isCompiling={isCompiling}
            onJumpToLine={onJumpToLine}
          />
        )
    }
  }

  const errorCount = result?.diagnostics.length ?? 0

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
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--cc-border)] px-1.5">
        <div
          role="tablist"
          aria-label="Results"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
          onKeyDown={onTabListKeyDown}
        >
          {TABS.map((tab) => {
            const active = tab.id === activeTab
            const tabId = tabIdFor(tab.id)
            const panelId = panelIdFor(tab.id)
            const showErrorsBadge = tab.id === 'errors' && errorCount > 0

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
                className={`flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-[11px] tracking-tight transition-colors ${
                  active
                    ? 'bg-[var(--cc-primary)]/20 text-[var(--cc-primary-hover)]'
                    : 'text-[var(--cc-text-muted)] hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]'
                }`}
              >
                <span>{tab.label}</span>
                {showErrorsBadge ? (
                  <span className="rounded-full bg-rose-500/25 px-1.5 py-0 text-[10px] font-medium text-rose-300 tabular-nums">
                    {errorCount}
                  </span>
                ) : null}
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
