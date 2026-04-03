import { useEffect, useState } from 'react'
import StudentLayout from '../../layouts/StudentLayout'
import api from '../../utils/api'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import EmptyState from '../../components/EmptyState'
import logger from '../../utils/logger'

const examTypeLabels = {
  INTERNAL: 'Internal',
  MIDTERM: 'Mid-Term',
  FINAL: 'Final',
  PREBOARD: 'Preboard'
}

const gradeTone = (grade) => {
  if (grade === 'A+' || grade === 'A') return 'text-green-600 bg-green-50'
  if (grade === 'B+' || grade === 'B') return 'text-blue-600 bg-blue-50'
  if (grade === 'C+' || grade === 'C') return 'text-amber-600 bg-amber-50'
  return 'text-red-600 bg-red-50'
}

const emptyResultSheet = {
  subjects: [],
  totals: { obtainedMarks: 0, totalMarks: 0 },
  overallPercentage: 0,
  overallGrade: '-',
  overallGpa: 0
}

const emptySummary = {
  analytics: {
    chartData: [],
    strongestSubject: null,
    weakestSubject: null
  },
  ranking: {
    rank: null,
    cohortSize: 0,
    percentile: 0,
    topStudents: [],
    scope: {
      semester: null,
      department: null
    }
  }
}

const StudentMarks = () => {
  const [marks, setMarks] = useState([])
  const [resultSheet, setResultSheet] = useState(emptyResultSheet)
  const [summary, setSummary] = useState(emptySummary)
  const [availableExamTypes, setAvailableExamTypes] = useState([])
  const [selectedExamType, setSelectedExamType] = useState('')
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetchMarks()
  }, [page, selectedExamType])

  const fetchMarks = async () => {
    try {
      setLoading(true)
      const res = await api.get('/marks/my', {
        params: {
          page,
          limit,
          ...(selectedExamType ? { examType: selectedExamType } : {})
        }
      })
      const effectiveExamType = res.data.examType || selectedExamType || ''

      setMarks(res.data.marks || [])
      setResultSheet(res.data.resultSheet || emptyResultSheet)
      setAvailableExamTypes(res.data.availableExamTypes || [])
      setTotal(res.data.total || 0)

      if (effectiveExamType) {
        const summaryRes = await api.get('/marks/my/summary', {
          params: {
            examType: effectiveExamType
          }
        })

        setSummary({
          analytics: summaryRes.data.analytics || emptySummary.analytics,
          ranking: summaryRes.data.ranking || emptySummary.ranking
        })
      } else {
        setSummary(emptySummary)
      }

      if (!selectedExamType && res.data.examType) {
        setSelectedExamType(res.data.examType)
      }
    } catch (error) {
      logger.error(error)
      setSummary(emptySummary)
    } finally {
      setLoading(false)
    }
  }

  return (
    <StudentLayout>
      <div className="p-8">
        <PageHeader
          title="Exam Results"
          subtitle="Select a published exam result to view your overall GPA and subject-wise marks. Practical marks are not shown to students."
          breadcrumbs={['Student', 'Results']}
        />

        {loading ? (
          <div className="py-8 text-center text-gray-500">Loading...</div>
        ) : (
          <>
            <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Result Session</p>
                  <p className="mt-1 text-sm text-slate-500">Choose a published exam result to view your GPA, ranking, and subject trends.</p>
                </div>
                <div className="w-full md:max-w-xs">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Select Exam</label>
                  <select
                    value={selectedExamType}
                    onChange={(event) => {
                      setSelectedExamType(event.target.value)
                      setPage(1)
                    }}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {availableExamTypes.length === 0 ? (
                      <option value="">No published exams available</option>
                    ) : (
                      availableExamTypes.map((examType) => (
                        <option key={examType} value={examType}>
                          {examTypeLabels[examType] || examType}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>

            {resultSheet.subjects.length === 0 ? (
              <EmptyState
                icon="📄"
                title="No published result found"
                description="Once the coordinator publishes your selected exam result, it will appear here with subject-wise marks and overall GPA."
              />
            ) : (
              <>
                <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                    <p className="text-sm text-gray-500">Exam</p>
                    <p className="mt-2 text-xl font-black text-slate-900">
                      {examTypeLabels[selectedExamType] || selectedExamType}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                    <p className="text-sm text-gray-500">Overall GPA</p>
                    <p className="mt-2 text-3xl font-black text-slate-900">{resultSheet.overallGpa.toFixed(2)}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                    <p className="text-sm text-gray-500">Overall Grade</p>
                    <p className="mt-2 text-3xl font-black text-slate-900">{resultSheet.overallGrade}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                    <p className="text-sm text-gray-500">Combined Score</p>
                    <p className="mt-2 text-xl font-black text-slate-900">
                      {resultSheet.totals.obtainedMarks}/{resultSheet.totals.totalMarks}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{resultSheet.overallPercentage}% overall</p>
                  </div>
                </div>

                <div className="mb-6 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">Performance Chart</h2>
                        <p className="mt-1 text-sm text-slate-500">Subject-by-subject percentage breakdown for this published exam.</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {summary.analytics.chartData.length} subjects
                      </span>
                    </div>

                    <div className="mt-6 space-y-4">
                      {summary.analytics.chartData.map((subject) => (
                        <div key={subject.subjectCode}>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{subject.subjectName}</p>
                              <p className="text-xs text-slate-500">{subject.subjectCode}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold text-slate-900">{subject.percentage}%</p>
                              <p className="text-xs text-slate-500">GPA {subject.gradePoint.toFixed(1)} • {subject.grade}</p>
                            </div>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#0f766e_100%)]"
                              style={{ width: `${Math.max(6, Math.min(subject.percentage, 100))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                      <p className="text-sm text-slate-500">Semester Ranking</p>
                      <p className="mt-2 text-3xl font-black text-slate-900">
                        {summary.ranking.rank ? `#${summary.ranking.rank}` : '--'}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        {summary.ranking.cohortSize > 0
                          ? `Out of ${summary.ranking.cohortSize} students in Semester ${summary.ranking.scope.semester || '--'}${summary.ranking.scope.department ? ` • ${summary.ranking.scope.department}` : ''}`
                          : 'Ranking will appear once comparable published results are available.'}
                      </p>
                      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Percentile</p>
                        <p className="mt-2 text-xl font-bold text-slate-900">{summary.ranking.percentile.toFixed(2)}%</p>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                      <h2 className="text-lg font-semibold text-slate-900">Insight Snapshot</h2>
                      <div className="mt-4 space-y-3">
                        <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Strongest Subject</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {summary.analytics.strongestSubject?.subjectName || 'Not available'}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {summary.analytics.strongestSubject
                              ? `${summary.analytics.strongestSubject.subjectCode} • ${summary.analytics.strongestSubject.percentage}% • ${summary.analytics.strongestSubject.grade}`
                              : 'No published subject result yet.'}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-amber-50 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Needs More Attention</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {summary.analytics.weakestSubject?.subjectName || 'Not available'}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {summary.analytics.weakestSubject
                              ? `${summary.analytics.weakestSubject.subjectCode} • ${summary.analytics.weakestSubject.percentage}% • ${summary.analytics.weakestSubject.grade}`
                              : 'No published subject result yet.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {summary.ranking.topStudents.length > 0 && (
                      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                        <h2 className="text-lg font-semibold text-slate-900">Top Rankers</h2>
                        <div className="mt-4 space-y-3">
                          {summary.ranking.topStudents.map((student, index) => (
                            <div key={`${student.userId}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{student.name}</p>
                                <p className="text-xs text-slate-500">Rank #{index + 1}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-slate-900">{student.overallGpa.toFixed(2)} GPA</p>
                                <p className="text-xs text-slate-500">{student.overallPercentage}%</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="border-b p-6">
                    <h2 className="text-lg font-semibold text-slate-900">Subject-wise Result List</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Published marks for all subjects in the selected exam that belong to your enrolled semester modules.
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {resultSheet.subjects.map((subject) => (
                        <div key={subject.id} className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{subject.subjectName}</p>
                            <p className="mt-1 text-xs text-slate-500">{subject.subjectCode}</p>
                          </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            Marks: {subject.obtainedMarks}/{subject.totalMarks}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {subject.percentage}%
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${gradeTone(subject.grade)}`}>
                            Grade: {subject.grade}
                          </span>
                          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                            GPA: {subject.gradePoint.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {marks.length > 0 && (
                  <div className="mt-6 rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b p-6">
                      <h2 className="text-lg font-semibold text-slate-900">Published Mark Ledger</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[860px]">
                        <thead className="bg-slate-50">
                          <tr className="text-left text-sm text-slate-500">
                            <th className="px-6 py-4">Subject</th>
                            <th className="px-6 py-4">Marks</th>
                            <th className="px-6 py-4">Percentage</th>
                            <th className="px-6 py-4">Grade</th>
                            <th className="px-6 py-4">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {marks.map((mark) => (
                            <tr key={mark.id} className="border-t">
                              <td className="px-6 py-4">
                                <p className="font-medium text-slate-900">{mark.subject?.name}</p>
                                <p className="text-xs text-slate-500">{mark.subject?.code}</p>
                              </td>
                              <td className="px-6 py-4 text-slate-700">{mark.obtainedMarks}/{mark.totalMarks}</td>
                              <td className="px-6 py-4 text-slate-700">{mark.percentage.toFixed(1)}%</td>
                              <td className="px-6 py-4 text-slate-700">{mark.grade}</td>
                              <td className="px-6 py-4 text-sm text-slate-500">{mark.remarks || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </StudentLayout>
  )
}

export default StudentMarks
