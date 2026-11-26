import EmptyState from '../../components/common/EmptyState'
import type { CompileResult } from '../../types/ide'

interface TokensPanelProps {
  result: CompileResult | null
  isCompiling: boolean
}

export default function TokensPanel({ result, isCompiling }: TokensPanelProps) {
  if (isCompiling) {
    return (
      <EmptyState
        title="Lexing source…"
        description="Running CompileCraft Flex lexer."
      />
    )
  }

  if (!result) {
    return (
      <EmptyState
        title="No tokens yet"
        description="Click Run (Ctrl+Enter) to lex and compile the active editor."
      />
    )
  }

  if (result.tokens.length === 0) {
    return (
      <EmptyState
        title="No tokens emitted"
        description={
          result.errorSummary ||
          'The lexer did not produce tokens for this input.'
        }
      />
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--cc-border)] bg-[var(--cc-surface-elevated)]/50 px-3 py-1.5 text-[11px] text-[var(--cc-text-muted)]">
        <span>{result.tokens.length} tokens</span>
        <span className="uppercase">{result.language} lexer</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-xs">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-[var(--cc-surface)] text-[10px] uppercase tracking-wider text-[var(--cc-text-muted)]">
            <tr className="border-b border-[var(--cc-border)]">
              <th className="w-14 px-3 py-1.5 font-medium">Line</th>
              <th className="px-3 py-1.5 font-medium">Token</th>
              <th className="px-3 py-1.5 font-medium">Lexeme</th>
            </tr>
          </thead>
          <tbody>
            {result.tokens.map((token, index) => (
              <tr
                key={`${token.line}-${token.tokenType}-${index}`}
                className="border-b border-[var(--cc-border)]/40 hover:bg-[var(--cc-surface-elevated)]/60"
              >
                <td className="px-3 py-1 text-[var(--cc-text-muted)] tabular-nums">
                  {token.line}
                </td>
                <td className="px-3 py-1 text-[var(--cc-primary-hover)]">
                  {token.tokenType}
                </td>
                <td className="break-all px-3 py-1 text-[var(--cc-text)]">
                  {token.lexeme}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
