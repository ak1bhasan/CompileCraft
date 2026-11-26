import { AlertCircle, CheckCircle2 } from 'lucide-react'
import EmptyState from '../../components/common/EmptyState'
import type { CompileResult } from '../../types/ide'

interface DiagnosticsPanelProps {
  result: CompileResult | null
  isCompiling: boolean
  onJumpToLine?: (line: number, column?: number) => void
}

export default function DiagnosticsPanel({
  result,
  isCompiling,
  onJumpToLine,
}: DiagnosticsPanelProps) {
  if (isCompiling) {
    return (
      <EmptyState
        title="Compiling…"
        description="Inspecting lexical, syntax, and semantic rules."
      />
    )
  }

  if (!result) {
    return (
      <EmptyState
        title="No diagnostics yet"
        description="Errors from Flex, Bison, and semantic analysis will appear here."
      />
    )
  }

  if (result.ok && result.diagnostics.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <CheckCircle2 size={24} className="text-[var(--cc-success)]" />
        <p className="text-sm font-medium text-[var(--cc-text)]">
          Zero errors found
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-[var(--cc-text-secondary)]">
          Lexical, syntax, and semantic analysis passed cleanly in{' '}
          {result.durationMs} ms.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--cc-border)] bg-[var(--cc-danger-bg)] px-3 py-1.5 text-[11px] font-medium text-[var(--cc-danger-text)]">
        <span>
          {result.diagnostics.length}{' '}
          {result.diagnostics.length === 1 ? 'error' : 'errors'}
        </span>
        <span>
          Exit code{' '}
          {result.ok && result.executionExitCode !== null
            ? result.executionExitCode
            : result.exitCode}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2 space-y-1.5">
        {result.diagnostics.map((item, index) => (
          <button
            key={`${item.stage}-${item.line ?? 'x'}-${index}`}
            type="button"
            data-testid={`diagnostics-error-item-${index}`}
            disabled={item.line === null || !onJumpToLine}
            onClick={() => {
              if (item.line !== null && onJumpToLine) {
                onJumpToLine(item.line, item.column ?? undefined)
              }
            }}
            className={`flex w-full items-start gap-2 rounded-md border border-[var(--cc-danger-border)] bg-[var(--cc-danger-bg)] p-2.5 text-left transition-colors ${
              item.line !== null && onJumpToLine
                ? 'cursor-pointer hover:bg-[var(--cc-danger-bg-strong)]'
                : 'cursor-default'
            }`}
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--cc-danger)]" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="rounded bg-[var(--cc-danger-bg-strong)] px-1.5 py-0.5 font-medium text-[var(--cc-danger-text)]">
                  {item.stage} Error
                </span>
                {item.line !== null ? (
                  <span className="font-mono text-[var(--cc-text-secondary)] underline decoration-[var(--cc-border)] underline-offset-2">
                    Line {item.line}
                  </span>
                ) : null}
              </div>
              <p className="break-words font-mono text-xs leading-relaxed text-[var(--cc-text)]">
                {item.message}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
