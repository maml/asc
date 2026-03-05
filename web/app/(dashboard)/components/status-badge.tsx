const statusStyles: Record<string, { dot: string; text: string; bg: string }> = {
  active:         { dot: "bg-accent-green", text: "text-accent-green", bg: "bg-accent-green/10" },
  healthy:        { dot: "bg-accent-green", text: "text-accent-green", bg: "bg-accent-green/10" },
  compliant:      { dot: "bg-accent-green", text: "text-accent-green", bg: "bg-accent-green/10" },
  pending_review: { dot: "bg-accent-yellow", text: "text-accent-yellow", bg: "bg-accent-yellow/10" },
  draft:          { dot: "bg-accent-yellow", text: "text-accent-yellow", bg: "bg-accent-yellow/10" },
  warning:        { dot: "bg-accent-yellow", text: "text-accent-yellow", bg: "bg-accent-yellow/10" },
  issued:         { dot: "bg-accent-blue", text: "text-accent-blue", bg: "bg-accent-blue/10" },
  paid:           { dot: "bg-accent-green", text: "text-accent-green", bg: "bg-accent-green/10" },
  overdue:        { dot: "bg-accent-red", text: "text-accent-red", bg: "bg-accent-red/10" },
  suspended:      { dot: "bg-accent-red", text: "text-accent-red", bg: "bg-accent-red/10" },
  deactivated:    { dot: "bg-muted", text: "text-muted", bg: "bg-muted/10" },
  deprecated:     { dot: "bg-muted", text: "text-muted", bg: "bg-muted/10" },
  disabled:       { dot: "bg-accent-red", text: "text-accent-red", bg: "bg-accent-red/10" },
};

const fallback = { dot: "bg-muted", text: "text-muted-foreground", bg: "bg-surface-raised" };

export function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? fallback;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status.replace(/_/g, " ")}
    </span>
  );
}
