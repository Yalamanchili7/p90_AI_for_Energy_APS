import { cn } from "@/lib/utils";

// ─── Card ────────────────────────────────────────────────────
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-ink-200 bg-white shadow-card",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-b border-ink-100 px-5 py-3", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-sm font-semibold text-ink", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-5", className)} {...props}>
      {children}
    </div>
  );
}

// ─── MetricCard ──────────────────────────────────────────────
export function MetricCard({
  label,
  value,
  unit,
  delta,
  caption,
  tone = "default",
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: { value: string; direction: "up" | "down" | "flat"; label?: string };
  caption?: string;
  tone?: "default" | "warn" | "danger" | "ok";
}) {
  const toneColor = {
    default: "text-ink",
    warn: "text-accent-warn",
    danger: "text-accent-danger",
    ok: "text-accent-ok",
  }[tone];

  return (
    <Card className="p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={cn("text-3xl font-semibold tabular-nums", toneColor)}>
          {value}
        </span>
        {unit && (
          <span className="text-sm font-medium text-ink-500">{unit}</span>
        )}
      </div>
      {delta && (
        <div
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-xs font-medium",
            delta.direction === "up" && "text-accent-danger",
            delta.direction === "down" && "text-accent-ok",
            delta.direction === "flat" && "text-ink-500"
          )}
        >
          {delta.direction === "up" && "↑"}
          {delta.direction === "down" && "↓"}
          {delta.direction === "flat" && "→"}
          <span>{delta.value}</span>
          {delta.label && <span className="text-ink-500">{delta.label}</span>}
        </div>
      )}
      {caption && !delta && (
        <div className="mt-1 text-xs text-ink-500">{caption}</div>
      )}
    </Card>
  );
}

// ─── Badge ───────────────────────────────────────────────────
export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "warn" | "danger" | "ok" | "brand";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        tone === "default" && "bg-ink-100 text-ink-700",
        tone === "brand" && "bg-brand-50 text-brand-700",
        tone === "ok" && "bg-green-50 text-green-700",
        tone === "warn" && "bg-amber-50 text-amber-700",
        tone === "danger" && "bg-red-50 text-red-700",
        className
      )}
    >
      {children}
    </span>
  );
}
