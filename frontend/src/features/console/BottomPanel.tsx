import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import EmptyState from '../../components/common/EmptyState'
import type { BottomTabId, CompileResult } from '../../types/ide'

interface BottomPanelProps {
  collapsed: boolean
  onToggle: () => void
  activeTab: BottomTabId
  onTabChange: (tab: BottomTabId) => void
  result: CompileResult | null
  isCompiling: boolean
  onJumpToLine?: (line: number) => void
}

const TABS: { id: BottomTabId; label: string }[] = [
  { id: 'output', label: 'Output' },
  { id: 'problems', label: 'Problems' },
  { id: 'terminal', label: 'Terminal' },
]

export default function BottomPanel({
  collapsed,
  onToggle,
  activeTab,
  onTabChange,
  result,
  isCompiling,
  onJumpToLine,
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

  const problemCount = result?.diagnostics.length ?? 0

  const renderOutput = () => {
    if (isCompiling) {
      return (
        <div className="p-3 font-mono text-xs text-[var(--cc-text-muted)]">
          Running CompileCraft compiler pipeline…
        </div>
      )
    }

    if (!result) {
      return (
        <EmptyState
          title="No compiler output yet"
          description="Press Run (Ctrl+Enter) to compile the active file with bin/compilecraft.exe."
        />
      )
    }

    if (result.ok) {
      const tacLines = result.tac.trim()
        ? result.tac.trimEnd().split(/\r?\n/).length
        : 0
      return (
        <div className="p-3 font-mono text-xs space-y-1.5 text-[var(--cc-text)]">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 size={14} />
            <span>
              Compilation succeeded ({result.language.toUpperCase()}) in{' '}
              {result.durationMs} ms — exit code 0
            </span>
          </div>
          <p className="text-[var(--cc-text-muted)]">
            Tokens: {result.tokens.length} | Symbols: {result.symbols.length} |
            TAC instructions: {tacLines}
          </p>
        </div>
      )
    }

    return (
      <div className="p-3 font-mono text-xs space-y-1.5">
        <div className="flex items-center gap-2 text-rose-400">
          <AlertCircle size={14} />
          <span>
            Compilation failed ({result.language.toUpperCase()}) — exit code{' '}
            {result.exitCode} ({result.durationMs} ms)
          </span>
        </div>
        <pre className="whitespace-pre-wrap break-words text-rose-200">
          {result.rawStderr || result.errorSummary}
        </pre>
      </div>
    )
  }

  const renderProblems = () => {
    if (isCompiling) {
      return (
        <div className="p-3 font-mono text-xs text-[var(--cc-text-muted)]">
          Checking lexical, syntax, and semantic rules…
        </div>
      )
    }

    if (!result) {
      return (
        <EmptyState
          title="No problems reported"
          description="Diagnostics from compilation will appear here."
        />
      )
    }

    if (result.diagnostics.length === 0) {
      return (
        <div className="p-3 font-mono text-xs text-emerald-400">
          0 problems in active file.
        </div>
      )
    }

    return (
      <div className="divide-y divide-[var(--cc-border)]/50 font-mono text-xs">
        {result.diagnostics.map((diag, index) => (
          <button
            key={`${diag.stage}-${diag.line ?? 'x'}-${index}`}
            type="button"
            disabled={diag.line === null || !onJumpToLine}
            onClick={() => {
              if (diag.line !== null && onJumpToLine) {
                onJumpToLine(diag.line)
              }
            }}
            className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-[var(--cc-surface-elevated)]/60 disabled:cursor-default"
          >
            <AlertCircle size={13} className="shrink-0 text-rose-400" />
            <span className="shrink-0 text-rose-300">{diag.stage}</span>
            <span className="min-w-0 flex-1 truncate text-[var(--cc-text)]">
              {diag.message}
            </span>
            {diag.line !== null ? (
              <span className="shrink-0 text-[var(--cc-text-muted)]">
                Ln {diag.line}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    )
  }

  const renderTerminal = () => {
    if (!result) {
      return (
        <EmptyState
          title="Ready to invoke CompileCraft CLI"
          description="Electron main process executes bin/compilecraft.exe via child_process.spawn (no shell) on temp source buffers."
        />
      )
    }

    const cliDisplay = result.cliPath || 'bin/compilecraft.exe'
    return (
      <pre className="p-3 font-mono text-xs leading-relaxed text-[var(--cc-text-muted)] whitespace-pre-wrap break-all">
        {[
          `$ "${cliDisplay}" --tokens <temp-source>.${result.language}`,
          `$ "${cliDisplay}" <temp-source>.${result.language}`,
          result.ok
            ? `$ "${cliDisplay}" --ast <temp-source>.${result.language}\n$ "${cliDisplay}" --symtab <temp-source>.${result.language}`
            : null,
          `[exit=${result.exitCode}, duration=${result.durationMs}ms]`,
        ]
          .filter(Boolean)
          .join('\n')}
      </pre>
    )
  }

  const panelContent = (tab: BottomTabId) => {
    switch (tab) {
      case 'output':
        return renderOutput()
      case 'problems':
        return renderProblems()
      case 'terminal':
        return renderTerminal()
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
                className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors ${
                  active
                    ? 'bg-[var(--cc-primary)]/20 text-[var(--cc-primary-hover)]'
                    : 'text-[var(--cc-text-muted)] hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.id === 'problems' && problemCount > 0 ? (
                  <span className="rounded-full bg-rose-500/25 px-1.5 py-0 text-[10px] font-medium text-rose-300 tabular-nums">
                    {problemCount}
                  </span>
                ) : null}
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
