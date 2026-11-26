import EmptyState from '../../components/common/EmptyState'
import type { CompileResult } from '../../types/ide'

interface ASTPanelProps {
  result: CompileResult | null
  isCompiling: boolean
}

export default function ASTPanel({ result, isCompiling }: ASTPanelProps) {
  if (isCompiling) {
    return (
      <EmptyState
        title="Building AST…"
        description="Running Bison parser and shared AST builder."
      />
    )
  }

  if (!result) {
    return (
      <EmptyState
        title="No AST generated yet"
        description="Click Run (Ctrl+Enter) to parse and inspect the syntax tree."
      />
    )
  }

  if (!result.ast.trim()) {
    return (
      <EmptyState
        title="AST unavailable"
        description={
          result.ok
            ? 'The parser returned an empty AST.'
            : 'Syntax or lexical errors prevented AST construction. Check the Errors tab.'
        }
      />
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--cc-border)] bg-[var(--cc-surface-elevated)]/50 px-3 py-1.5 text-[11px] text-[var(--cc-text-muted)]">
        <span>Abstract Syntax Tree</span>
        <span className="uppercase">{result.language}</span>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre p-3 font-mono text-xs leading-relaxed text-[var(--cc-text)]">
        {result.ast}
      </pre>
    </div>
  )
}
