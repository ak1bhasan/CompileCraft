import EmptyState from '../../components/common/EmptyState'
import type { CompileResult } from '../../types/ide'

interface SymbolTablePanelProps {
  result: CompileResult | null
  isCompiling: boolean
}

export default function SymbolTablePanel({
  result,
  isCompiling,
}: SymbolTablePanelProps) {
  if (isCompiling) {
    return (
      <EmptyState
        title="Checking symbols…"
        description="Running scoped symbol table and semantic analysis."
      />
    )
  }

  if (!result) {
    return (
      <EmptyState
        title="No symbol table yet"
        description="Click Run (Ctrl+Enter) to analyze declarations and scopes."
      />
    )
  }

  if (!result.ok) {
    return (
      <EmptyState
        title="Symbol table withheld"
        description="Resolve lexical, syntax, or semantic errors in the Errors tab first."
      />
    )
  }

  if (result.symbols.length === 0) {
    return (
      <EmptyState
        title="No symbols declared"
        description="Semantic analysis succeeded with zero declared variables."
      />
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--cc-border)] bg-[var(--cc-surface-elevated)]/50 px-3 py-1.5 text-[11px] text-[var(--cc-text-muted)]">
        <span>{result.symbols.length} symbols</span>
        <span>Scoped symbol table</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-xs">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-[var(--cc-surface)] text-[10px] uppercase tracking-wider text-[var(--cc-text-muted)]">
            <tr className="border-b border-[var(--cc-border)]">
              <th className="w-14 px-3 py-1.5 font-medium">Line</th>
              <th className="px-3 py-1.5 font-medium">Identifier</th>
              <th className="px-3 py-1.5 font-medium">Type</th>
              <th className="w-16 px-3 py-1.5 font-medium">Scope</th>
            </tr>
          </thead>
          <tbody>
            {result.symbols.map((symbol, index) => (
              <tr
                key={`${symbol.line}-${symbol.name}-${symbol.scope}-${index}`}
                className="border-b border-[var(--cc-border)]/40 hover:bg-[var(--cc-surface-elevated)]/60"
              >
                <td className="px-3 py-1 text-[var(--cc-text-muted)] tabular-nums">
                  {symbol.line}
                </td>
                <td className="px-3 py-1 font-medium text-[var(--cc-text)]">
                  {symbol.name}
                </td>
                <td className="px-3 py-1 text-[var(--cc-primary-hover)]">
                  {symbol.dataType}
                </td>
                <td className="px-3 py-1 text-[var(--cc-text-muted)] tabular-nums">
                  {symbol.scope}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
