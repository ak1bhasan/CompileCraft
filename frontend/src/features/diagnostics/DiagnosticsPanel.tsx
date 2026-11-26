import { AlertCircle, CheckCircle2 } from 'lucide-react'
import EmptyState from '../../components/common/EmptyState'
import type { CompileResult } from '../../types/ide'

interface DiagnosticsPanelProps {
  result: CompileResult | null
  isCompiling: boolean
  onJumpToLine?: (line: number) => void
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
        <CheckCircle2 size={24} className="text-emerald-400" />
        <p className="text-sm font-medium text-[var(--cc-text)]">
          Zero errors found
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-[var(--cc-text-muted)]">
          Lexical, syntax, and semantic analysis passed cleanly in{' '}
          {result.durationMs} ms.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--cc-border)] bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-300">
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
            disabled={item.line === null || !onJumpToLine}
            onClick={() => {
              if (item.line !== null && onJumpToLine) {
                onJumpToLine(item.line)
              }
            }}
            className={`flex w-full items-start gap-2 rounded-md border border-rose-500/25 bg-rose-500/5 p-2.5 text-left transition-colors ${
              item.line !== null && onJumpToLine
                ? 'cursor-pointer hover:border-rose-400/50 hover:bg-rose-500/10'
                : 'cursor-default'
            }`}
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-rose-400" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-medium text-rose-300">
                  {item.stage} Error
                </span>
                {item.line !== null ? (
                  <span className="font-mono text-[var(--cc-text-muted)]">
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
