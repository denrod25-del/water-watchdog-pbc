export function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, score);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background:
              score >= 60
                ? "var(--hot)"
                : score >= 30
                  ? "var(--warm)"
                  : score >= 10
                    ? "var(--cool)"
                    : "var(--cold)",
          }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{score}</span>
    </div>
  );
}
