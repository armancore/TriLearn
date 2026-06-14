const clampHeight = (value) => Math.max(10, Math.min(100, value))

const SimpleBarChart = ({ data = [] }) => {
  if (!data.length) {
    return null
  }

  return (
    <div className="mt-6 rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-4">
      <div className="flex h-64 items-end gap-3 overflow-x-auto">
        {data.map((item) => (
          <div key={item.subjectCode} className="flex min-w-[72px] flex-1 flex-col items-center gap-3">
            <div className="text-xs font-semibold text-[var(--color-text-muted)]">
              {item.percentage}%
            </div>
            <svg className="h-44 w-full rounded-2xl bg-[var(--color-card-surface)] px-2 py-2 shadow-sm" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${item.subjectName}: ${item.percentage}%`}>
              <rect
                x="8"
                y={100 - clampHeight(item.percentage)}
                width="84"
                height={clampHeight(item.percentage)}
                rx="6"
                fill="url(#simple-bar-chart-fill)"
              />
            </svg>
            <div className="text-center">
              <div className="text-xs font-semibold text-[var(--color-heading)]">
                {item.subjectCode}
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)]">
                {item.grade}
              </div>
            </div>
          </div>
        ))}
        <svg className="hidden" aria-hidden="true">
          <defs>
            <linearGradient id="simple-bar-chart-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#0f766e" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  )
}

export default SimpleBarChart
