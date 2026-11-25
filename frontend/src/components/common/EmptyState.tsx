interface EmptyStateProps {
  title: string
  description?: string
}

export default function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-[var(--cc-text-muted)]">{title}</p>
      {description ? (
        <p className="mt-2 max-w-sm text-xs leading-relaxed text-[var(--cc-text-muted)]/80">
          {description}
        </p>
      ) : null}
    </div>
  )
}
