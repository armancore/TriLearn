import { useCallback, useEffect, useState } from 'react'
import StudentLayout from '../../layouts/StudentLayout'
import api from '../../utils/api'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import EmptyState from '../../components/EmptyState'
import SimpleBarChart from '../../components/SimpleBarChart'
import Alert from '../../components/Alert'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import logger from '../../utils/logger'
import { isRequestCanceled } from '../../utils/http'

const examTypeLabels = {
  INTERNAL: 'Internal',
  MIDTERM: 'Mid-Term',
  FINAL: 'Final',
  PREBOARD: 'Preboard'
}

const gradeTone = (grade) => {
  if (grade === 'A+' || grade === 'A') return 'grade-pass'
  if (grade === 'B+' || grade === 'B') return 'grade-merit'
  if (grade === 'C+' || grade === 'C') return 'grade-average'
  return 'grade-fail'
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
  const [downloadingMarksheet, setDownloadingMarksheet] = useState(false)
  const [error, setError] = useState('')

  const fetchMarks = useCallback(async (signal) => {
    try {
      setLoading(true)
      setError('')
      const res = await api.get('/marks/my', {
        signal,
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
          signal,
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
      if (isRequestCanceled(error)) return
      logger.error(error)
      setSummary(emptySummary)
      setError(error.response?.data?.message || 'Unable to load marks right now')
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [limit, page, selectedExamType])

  useEffect(() => {
    const controller = new AbortController()
    void fetchMarks(controller.signal)
    return () => controller.abort()
  }, [fetchMarks])

  const downloadMarksheet = async () => {
    try {
      setDownloadingMarksheet(true)
      setError('')

      const response = await api.get('/marks/my/marksheet', {
        params: selectedExamType ? { examType: selectedExamType } : {},
        responseType: 'blob'
      })

      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      const contentDisposition = response.headers['content-disposition'] || ''
      const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/)
      link.href = url
      link.download = fileNameMatch?.[1] || `marksheet-${selectedExamType || 'result'}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (downloadError) {
      logger.error(downloadError)
      setError('Unable to download your marksheet right now')
    } finally {
      setDownloadingMarksheet(false)
    }
  }

  return (
    <StudentLayout>
      <div className="p-8">
        <PageHeader
          title="Exam Results"
          subtitle="Select a published exam result to view your overall GPA and subject-wise marks. Practical marks are not shown to students."
          breadcrumbs={['Student', 'Results']}
          actions={resultSheet.subjects.length > 0 ? [
            {
              label: downloadingMarksheet ? 'Preparing PDF...' : 'Download Marksheet PDF',
              onClick: downloadMarksheet,
              disabled: downloadingMarksheet
            }
          ] : []}
        />

        <Alert type="error" message={error} />

        {loading ? (
          <LoadingSkeleton rows={5} itemClassName="h-36" />
        ) : (
          <>
            <div className="ui-card mb-6 rounded-3xl p-5 md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-heading)]">Result Session</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">Choose a published exam result to view your GPA, class standing, and subject trends.</p>
                </div>
                <div className="w-full md:max-w-xs">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Select Exam</label>
                  <select
                    value={selectedExamType}
                    onChange={(event) => {
                      setSelectedExamType(event.target.value)
                      setPage(1)
                    }}
                    className="ui-form-input"
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
                  <div className="ui-card rounded-3xl p-5 md:p-6">
                    <p className="text-sm text-[var(--color-text-muted)]">Exam</p>
                    <p className="mt-2 text-xl font-black text-[var(--color-heading)]">
                      {examTypeLabels[selectedExamType] || selectedExamType}
                    </p>
                  </div>
                  <div className="ui-card rounded-3xl p-5 md:p-6">
                    <p className="text-sm text-[var(--color-text-muted)]">Overall GPA</p>
                    <p className="mt-2 text-3xl font-black text-[var(--color-heading)]">{resultSheet.overallGpa.toFixed(2)}</p>
                  </div>
                  <div className="ui-card rounded-3xl p-5 md:p-6">
                    <p className="text-sm text-[var(--color-text-muted)]">Overall Grade</p>
                    <p className="mt-2 text-3xl font-black text-[var(--color-heading)]">{resultSheet.overallGrade}</p>
                  </div>
                  <div className="ui-card rounded-3xl p-5 md:p-6">
                    <p className="text-sm text-[var(--color-text-muted)]">Combined Score</p>
                    <p className="mt-2 text-xl font-black text-[var(--color-heading)]">
                      {resultSheet.totals.obtainedMarks}/{resultSheet.totals.totalMarks}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">{resultSheet.overallPercentage}% overall</p>
                  </div>
                </div>

                <div className="mb-6 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
                  <div className="ui-card rounded-3xl p-5 md:p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--color-heading)]">Performance Chart</h2>
                        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Subject-by-subject percentage breakdown for this published exam.</p>
                      </div>
                      <span className="ui-status-badge ui-status-neutral px-3 py-1 text-xs font-semibold">
                        {summary.analytics.chartData.length} subjects
                      </span>
                    </div>

                    <SimpleBarChart data={summary.analytics.chartData} />
                  </div>

                  <div className="space-y-4">
                    <div className="ui-card rounded-3xl p-5 md:p-6">
                      <p className="text-sm text-[var(--color-text-muted)]">Semester Ranking</p>
                      <p className="mt-2 text-3xl font-black text-[var(--color-heading)]">
                        {summary.ranking.rank ? `#${summary.ranking.rank}` : '--'}
                      </p>
                      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                        {summary.ranking.cohortSize > 0
                          ? `Out of ${summary.ranking.cohortSize} students in Semester ${summary.ranking.scope.semester || '--'}${summary.ranking.scope.department ? ` • ${summary.ranking.scope.department}` : ''}`
                          : 'Ranking will appear once comparable published results are available.'}
                      </p>
                      <div className="mt-4 rounded-2xl bg-[var(--color-surface-muted)] px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Percentile</p>
                        <p className="mt-2 text-xl font-bold text-[var(--color-heading)]">{summary.ranking.percentile.toFixed(2)}%</p>
                      </div>
                    </div>

                    <div className="ui-card rounded-3xl p-5 md:p-6">
                      <h2 className="text-lg font-semibold text-[var(--color-heading)]">Insight Snapshot</h2>
                      <div className="mt-4 space-y-3">
                        <div className="status-present rounded-2xl px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em]">Strongest Subject</p>
                          <p className="mt-2 text-sm font-semibold text-[var(--color-heading)]">
                            {summary.analytics.strongestSubject?.subjectName || 'Not available'}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {summary.analytics.strongestSubject
                              ? `${summary.analytics.strongestSubject.subjectCode} • ${summary.analytics.strongestSubject.percentage}% • ${summary.analytics.strongestSubject.grade}`
                              : 'No published subject result yet.'}
                          </p>
                        </div>
                        <div className="status-late rounded-2xl px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em]">Needs More Attention</p>
                          <p className="mt-2 text-sm font-semibold text-[var(--color-heading)]">
                            {summary.analytics.weakestSubject?.subjectName || 'Not available'}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {summary.analytics.weakestSubject
                              ? `${summary.analytics.weakestSubject.subjectCode} • ${summary.analytics.weakestSubject.percentage}% • ${summary.analytics.weakestSubject.grade}`
                              : 'No published subject result yet.'}
                          </p>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                <div className="ui-card overflow-hidden rounded-3xl">
                  <div className="border-b p-6">
                    <h2 className="text-lg font-semibold text-[var(--color-heading)]">Subject-wise Result List</h2>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      Published marks for all subjects in the selected exam that belong to your enrolled semester modules.
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {resultSheet.subjects.map((subject) => (
                        <div key={subject.id} className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <p className="font-semibold text-[var(--color-heading)]">{subject.subjectName}</p>
                            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{subject.subjectCode}</p>
                          </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="ui-status-badge ui-status-neutral px-3 py-1 text-xs font-semibold">
                            Marks: {subject.obtainedMarks}/{subject.totalMarks}
                          </span>
                          <span className="ui-status-badge ui-status-neutral px-3 py-1 text-xs font-semibold">
                            {subject.percentage}%
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${gradeTone(subject.grade)}`}>
                            Grade: {subject.grade}
                          </span>
                          <span className="grade-merit rounded-full px-3 py-1 text-xs font-semibold">
                            GPA: {subject.gradePoint.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {marks.length > 0 && (
                  <div className="ui-card mt-6 overflow-hidden rounded-3xl">
                    <div className="border-b p-6">
                      <h2 className="text-lg font-semibold text-[var(--color-heading)]">Published Mark Ledger</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[860px]">
                        <thead className="bg-[var(--color-surface-muted)]">
                          <tr className="text-left text-sm text-[var(--color-text-muted)]">
                            <th scope="col" className="px-6 py-4">Subject</th>
                            <th scope="col" className="px-6 py-4">Marks</th>
                            <th scope="col" className="px-6 py-4">Percentage</th>
                            <th scope="col" className="px-6 py-4">Grade</th>
                            <th scope="col" className="px-6 py-4">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {marks.map((mark) => (
                            <tr key={mark.id} className="border-t">
                              <td className="px-6 py-4">
                                <p className="font-medium text-[var(--color-heading)]">{mark.subject?.name}</p>
                                <p className="text-xs text-[var(--color-text-muted)]">{mark.subject?.code}</p>
                              </td>
                              <td className="px-6 py-4 text-[var(--color-text-muted)]">{mark.obtainedMarks}/{mark.totalMarks}</td>
                              <td className="px-6 py-4 text-[var(--color-text-muted)]">{mark.percentage.toFixed(1)}%</td>
                              <td className="px-6 py-4 text-[var(--color-text-muted)]">{mark.grade}</td>
                              <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{mark.remarks || '-'}</td>
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
