import EmptyState from '../../components/common/EmptyState'
import type { CompileResult } from '../../types/ide'

interface TacPanelProps {
  result: CompileResult | null
  isCompiling: boolean
}

export default function TacPanel({ result, isCompiling }: TacPanelProps) {
  if (isCompiling) {
    return (
      <EmptyState
        title="Generating TAC…"
        description="Running CompileCraft compiler pipeline."
      />
    )
  }

  if (!result) {
    return (
      <EmptyState
        title="No TAC generated yet"
        description="Click Run (Ctrl+Enter) to generate Three-Address Code."
      />
    )
  }

  if (!result.ok) {
    return (
      <EmptyState
        title="TAC not generated"
        description="Compilation failed. TAC is suppressed whenever lexical, syntax, or semantic errors exist."
      />
    )
  }

  if (!result.tac.trim()) {
    return (
      <EmptyState
        title="Empty TAC output"
        description="Compilation succeeded with no intermediate instructions emitted."
      />
    )
  }

  const lines = result.tac.replace(/\r\n/g, '\n').trimEnd().split('\n')

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--cc-border)] bg-[var(--cc-surface-elevated)]/50 px-3 py-1.5 text-[11px] text-[var(--cc-text-secondary)]">
        <span>{lines.length} instructions</span>
        <span className="font-medium text-[var(--cc-success)]">Three-Address Code</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-xs leading-relaxed">
        {lines.map((line, index) => {
          const isLabel = line.trimEnd().endsWith(':')
          return (
            <div
              key={`${index}-${line}`}
              className="flex gap-3 rounded px-1.5 py-0.5 hover:bg-[var(--cc-surface-elevated)]/60"
            >
              <span className="w-7 shrink-0 select-none text-right text-[var(--cc-text-muted)]/60 tabular-nums">
                {index + 1}
              </span>
              <span
                className={
                  isLabel
                    ? 'font-semibold text-[var(--cc-primary-hover)]'
                    : 'text-[var(--cc-text)]'
                }
              >
                {line}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
