import type { ResultsTabId } from '../../types/ide'
import TokensPanel from '../lexer/TokensPanel'
import ParserPanel from '../parser/ParserPanel'
import ASTPanel from '../ast/ASTPanel'
import DiagnosticsPanel from '../diagnostics/DiagnosticsPanel'

interface ResultsPanelProps {
  activeTab: ResultsTabId
  onTabChange: (tab: ResultsTabId) => void
}

const TABS: { id: ResultsTabId; label: string }[] = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'parser', label: 'Parser' },
  { id: 'ast', label: 'AST' },
  { id: 'diagnostics', label: 'Diagnostics' },
]

export default function ResultsPanel({ activeTab, onTabChange }: ResultsPanelProps) {
  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden border-l border-[var(--cc-border)] bg-[var(--cc-surface)]">
      <div
        role="tablist"
        aria-label="Results"
        className="grid h-9 shrink-0 grid-cols-4 items-center gap-0.5 border-b border-[var(--cc-border)] px-1"
      >
        {TABS.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={tab.label}
              title={tab.label}
              onClick={() => onTabChange(tab.id)}
              className={`flex h-7 min-w-0 items-center justify-center rounded-md px-0.5 text-[10px] tracking-tight transition-colors ${
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
      <div className="min-h-0 flex-1 overflow-auto">
        {activeTab === 'tokens' ? <TokensPanel /> : null}
        {activeTab === 'parser' ? <ParserPanel /> : null}
        {activeTab === 'ast' ? <ASTPanel /> : null}
        {activeTab === 'diagnostics' ? <DiagnosticsPanel /> : null}
      </div>
    </section>
  )
}
