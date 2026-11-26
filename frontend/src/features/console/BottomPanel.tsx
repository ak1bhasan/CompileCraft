import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  Loader2,
  Square,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import EmptyState from '../../components/common/EmptyState'
import type { BottomTabId, CompileResult, ConsoleEntry } from '../../types/ide'

interface BottomPanelProps {
  collapsed: boolean
  onToggle: () => void
  activeTab: BottomTabId
  onTabChange: (tab: BottomTabId) => void
  result: CompileResult | null
  consoleEntries: ConsoleEntry[]
  isCompiling: boolean
  isRunning: boolean
  stdinClosed: boolean
  onSendInput?: (input: string) => void
  onSendEof?: () => void
  onStop?: () => void
  onJumpToLine?: (line: number) => void
}

const TABS: { id: BottomTabId; label: string }[] = [
  { id: 'output', label: 'Program Output' },
  { id: 'problems', label: 'Problems' },
  { id: 'terminal', label: 'Terminal' },
]

export default function BottomPanel({
  collapsed,
  onToggle,
  activeTab,
  onTabChange,
  result,
  consoleEntries,
  isCompiling,
  isRunning,
  stdinClosed,
  onSendInput,
  onSendEof,
  onStop,
  onJumpToLine,
}: BottomPanelProps) {
  const [stdinDraft, setStdinDraft] = useState('')
  const streamEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ block: 'end' })
  }, [consoleEntries, isRunning])

  useEffect(() => {
    if (isRunning && !stdinClosed && activeTab === 'output' && !collapsed) {
      inputRef.current?.focus()
    }
  }, [isRunning, stdinClosed, activeTab, collapsed])

  const submitStdin = (event?: FormEvent) => {
    event?.preventDefault()
    if (!isRunning || stdinClosed || !onSendInput) {
      return
    }
    const text = stdinDraft
    setStdinDraft('')
    onSendInput(text)
  }

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
          Compiling and running via CompileCraft TAC Virtual Machine…
        </div>
      )
    }

    if (!result) {
      return (
        <EmptyState
          title="No program output yet"
          description="Press Run (Ctrl+Enter) to compile and execute the active file via the shared TAC Virtual Machine."
        />
      )
    }

    if (result.ok) {
      const tacLines = result.tac.trim()
        ? result.tac.trimEnd().split(/\r?\n/).length
        : 0
      const execMs = result.executionDurationMs ?? 0
      const isRunningStatus = result.executionStatus === 'running'
      const isSuccess = result.executionStatus === 'succeeded'
      const isAborted = result.executionStatus === 'aborted'
      const statusColor = isRunningStatus
        ? 'text-sky-300'
        : isSuccess
          ? 'text-emerald-400'
          : isAborted
            ? 'text-amber-400'
            : 'text-rose-400'
      const statusLabel = isRunningStatus
        ? `Running (${result.language.toUpperCase()})…`
        : isSuccess
          ? `Completed (${result.language.toUpperCase()}) in ${execMs} ms — exit code 0`
          : isAborted
            ? `Execution stopped (${result.language.toUpperCase()}) — exit code ${result.executionExitCode ?? 130}`
            : `Runtime error (${result.language.toUpperCase()}) — exit code ${result.executionExitCode ?? 1} (${execMs} ms)`

      const hasEntries = consoleEntries.length > 0
      const hasStdoutFallback = !hasEntries && result.programOutput.length > 0

      return (
        <div className="p-3 font-mono text-xs space-y-2 text-[var(--cc-text)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className={`flex items-center gap-2 ${statusColor}`} data-testid="console-execution-status">
              {isRunningStatus ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isSuccess ? (
                <CheckCircle2 size={14} />
              ) : (
                <AlertCircle size={14} />
              )}
              <span>{statusLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              {isRunningStatus && onStop ? (
                <button
                  type="button"
                  data-testid="console-stop-btn"
                  onClick={onStop}
                  className="inline-flex h-6 items-center gap-1 rounded border border-rose-500/50 bg-rose-500/20 px-2 text-[11px] font-medium text-rose-200 transition-colors hover:bg-rose-500/30"
                >
                  <Square size={10} strokeWidth={2.2} />
                  Stop
                </button>
              ) : null}
              <span className="text-[11px] text-[var(--cc-text-muted)]">
                Compile: {result.durationMs} ms | Tokens: {result.tokens.length} | Symbols: {result.symbols.length} | TAC: {tacLines}
              </span>
            </div>
          </div>

          {hasEntries || hasStdoutFallback ? (
            <pre
              data-testid="program-output-stdout"
              className="max-h-36 overflow-y-auto rounded-md border border-[var(--cc-border)] bg-[var(--cc-bg)]/80 p-2.5 whitespace-pre-wrap break-words text-[var(--cc-text)] leading-relaxed"
            >
              {hasEntries
                ? consoleEntries.map((entry) => {
                    if (entry.kind === 'stdin') {
                      return (
                        <span
                          key={entry.id}
                          data-testid="console-input-echo"
                          className="text-sky-300 font-semibold"
                        >
                          {`> ${entry.text}`}
                        </span>
                      )
                    }
                    if (entry.kind === 'stderr') {
                      return (
                        <span key={entry.id} className="text-rose-300">
                          {entry.text}
                        </span>
                      )
                    }
                    if (entry.kind === 'system') {
                      return (
                        <span key={entry.id} className="text-amber-300/90 italic">
                          {entry.text}
                        </span>
                      )
                    }
                    return <span key={entry.id}>{entry.text}</span>
                  })
                : result.programOutput}
              <span ref={streamEndRef} />
            </pre>
          ) : isSuccess ? (
            <p className="text-[var(--cc-text-muted)] italic">
              (Program completed cleanly with no stdout output.)
            </p>
          ) : null}

          {isRunningStatus ? (
            stdinClosed ? (
              <div className="flex items-center justify-between rounded-md border border-[var(--cc-border)] bg-[var(--cc-bg)]/60 px-2.5 py-1.5 text-[11px] text-[var(--cc-text-muted)]">
                <span>Standard input closed (EOF sent) — waiting for program completion…</span>
              </div>
            ) : (
              <form
                onSubmit={submitStdin}
                className="flex items-center gap-2 rounded-md border border-[var(--cc-primary)]/40 bg-[var(--cc-bg)] px-2 py-1"
              >
                <span className="select-none text-sky-300 font-semibold">&gt;</span>
                <input
                  ref={inputRef}
                  type="text"
                  data-testid="console-stdin-input"
                  value={stdinDraft}
                  onChange={(event) => setStdinDraft(event.target.value)}
                  placeholder="Enter input and press Enter…"
                  aria-label="Program standard input"
                  className="min-w-0 flex-1 bg-transparent font-mono text-xs text-[var(--cc-text)] outline-none placeholder:text-[var(--cc-text-muted)]/70"
                />
                <button
                  type="submit"
                  data-testid="console-send-btn"
                  className="inline-flex h-6 items-center gap-1 rounded border border-[var(--cc-primary)]/50 bg-[var(--cc-primary)]/20 px-2 text-[11px] text-[var(--cc-primary-hover)] transition-colors hover:bg-[var(--cc-primary)]/30"
                >
                  <CornerDownLeft size={11} />
                  Send
                </button>
                {onSendEof ? (
                  <button
                    type="button"
                    data-testid="console-eof-btn"
                    onClick={onSendEof}
                    title="Send EOF and close standard input"
                    className="inline-flex h-6 items-center rounded border border-[var(--cc-border)] bg-[var(--cc-surface-elevated)] px-2 text-[11px] text-[var(--cc-text-muted)] transition-colors hover:text-[var(--cc-text)]"
                  >
                    Send EOF
                  </button>
                ) : null}
              </form>
            )
          ) : null}

          {!isRunningStatus && !isSuccess && (result.executionStderr || result.errorSummary) ? (
            <pre
              data-testid="program-output-stderr"
              className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2 whitespace-pre-wrap break-words text-rose-200"
            >
              {result.executionStderr || result.errorSummary}
            </pre>
          ) : null}
        </div>
      )
    }

    return (
      <div className="p-3 font-mono text-xs space-y-1.5">
        <div className="flex items-center gap-2 text-rose-400">
          <AlertCircle size={14} />
          <span>
            Compilation failed ({result.language.toUpperCase()}) — exit code{' '}
            {result.exitCode} ({result.durationMs} ms) — execution skipped
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
            ? `$ "${cliDisplay}" --ast <temp-source>.${result.language}\n$ "${cliDisplay}" --symtab <temp-source>.${result.language}\n$ "${cliDisplay}" --run <temp-source>.${result.language}`
            : null,
          `[compile_exit=${result.exitCode}, exec_status=${result.executionStatus}, exec_exit=${result.executionExitCode ?? 'n/a'}, duration=${result.durationMs}ms]`,
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
        collapsed ? 'h-9' : 'h-56'
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
