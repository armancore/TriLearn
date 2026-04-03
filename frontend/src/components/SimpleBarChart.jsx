const clampHeight = (value) => Math.max(10, Math.min(100, value))

const SimpleBarChart = ({ data = [] }) => {
  if (!data.length) {
    return null
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex h-64 items-end gap-3 overflow-x-auto">
        {data.map((item) => (
          <div key={item.subjectCode} className="flex min-w-[72px] flex-1 flex-col items-center gap-3">
            <div className="text-xs font-semibold text-slate-500">{item.percentage}%</div>
            <div className="flex h-44 w-full items-end rounded-2xl bg-white px-2 py-2 shadow-sm">
              <div
                className="w-full rounded-xl bg-[linear-gradient(180deg,#2563eb_0%,#0f766e_100%)]"
                style={{ height: `${clampHeight(item.percentage)}%` }}
                title={`${item.subjectName}: ${item.percentage}%`}
              />
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold text-slate-900">{item.subjectCode}</div>
              <div className="text-[11px] text-slate-500">{item.grade}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SimpleBarChart
