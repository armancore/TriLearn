import { useCallback, useEffect, useState } from 'react'
import { BookOpenCheck, Download, FileText, GraduationCap, Percent } from 'lucide-react'
import StudentLayout from '../../layouts/StudentLayout'
import api from '../../utils/api'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
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

const resultMetrics = ({ resultSheet, selectedExamType }) => [
  {
    label: 'Exam',
    value: examTypeLabels[selectedExamType] || selectedExamType || '-',
    icon: FileText
  },
  {
    label: 'Overall grade',
    value: resultSheet.overallGrade,
    icon: GraduationCap
  },
  {
    label: 'Overall score',
    value: `${resultSheet.overallPercentage}%`,
    icon: Percent
  },
  {
    label: 'Subjects',
    value: resultSheet.subjects.length,
    icon: BookOpenCheck
  }
]

const StudentMarks = () => {
  const [resultSheet, setResultSheet] = useState(emptyResultSheet)
  const [availableExamTypes, setAvailableExamTypes] = useState([])
  const [selectedExamType, setSelectedExamType] = useState('')
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
          ...(selectedExamType ? { examType: selectedExamType } : {})
        }
      })
      setResultSheet(res.data.resultSheet || emptyResultSheet)
      setAvailableExamTypes(res.data.availableExamTypes || [])

      if (!selectedExamType && res.data.examType) {
        setSelectedExamType(res.data.examType)
      }
    } catch (error) {
      if (isRequestCanceled(error)) return
      logger.error(error)
      setError(error.response?.data?.message || 'Unable to load marks right now')
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [selectedExamType])

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
      <div className="student-page p-8">
        <PageHeader
          title="Exam Results"
          subtitle="Select a published exam result to view your overall GPA and subject-wise marks. Practical marks are not shown to students."
          breadcrumbs={['Student', 'Results']}
          actions={resultSheet.subjects.length > 0 ? [
            {
              label: downloadingMarksheet ? 'Preparing PDF...' : 'Download Marksheet PDF',
              onClick: downloadMarksheet,
              disabled: downloadingMarksheet,
              icon: Download
            }
          ] : []}
        />

        <Alert type="error" message={error} />

        {loading ? (
          <LoadingSkeleton rows={5} itemClassName="h-36" />
        ) : (
          <>
            {resultSheet.subjects.length === 0 ? (
              <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-12">
                <div className="mb-6 flex flex-wrap gap-2">
                  {availableExamTypes.map((examType) => (
                    <button
                      key={examType}
                      type="button"
                      onClick={() => setSelectedExamType(examType)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selectedExamType === examType ? 'bg-[var(--color-heading)] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {examTypeLabels[examType] || examType}
                    </button>
                  ))}
                </div>
                <EmptyState
                  icon={FileText}
                  title="No published result found"
                  description="Once an admin publishes your selected exam result, it will appear here with subject-wise marks and overall GPA."
                />
              </section>
            ) : (
              <>
                <section className="mb-6 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
                  <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="bg-[var(--color-heading)] p-6 text-white md:p-8">
                      <div className="flex flex-wrap items-center gap-2">
                        {availableExamTypes.map((examType) => (
                          <button
                            key={examType}
                            type="button"
                            onClick={() => setSelectedExamType(examType)}
                            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selectedExamType === examType ? 'bg-white text-[var(--color-heading)]' : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white'}`}
                          >
                            {examTypeLabels[examType] || examType}
                          </button>
                        ))}
                      </div>

                      <div className="mt-10 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white/60">Overall GPA</p>
                          <p className="mt-3 text-6xl font-black leading-none md:text-7xl">{resultSheet.overallGpa.toFixed(2)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-5 md:min-w-[340px]">
                          <div>
                            <p className="text-xs font-semibold uppercase text-white/50">Grade</p>
                            <p className="mt-2 text-3xl font-black">{resultSheet.overallGrade}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase text-white/50">Score</p>
                            <p className="mt-2 text-3xl font-black">{resultSheet.overallPercentage}%</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-6 md:p-8">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-[var(--color-heading)]">
                          <GraduationCap className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-heading)]">Result transcript</p>
                          <p className="text-xs text-[var(--color-text-muted)]">{examTypeLabels[selectedExamType] || selectedExamType}</p>
                        </div>
                      </div>

                      <div className="mt-6 space-y-4">
                        <div>
                          <p className="text-xs font-semibold uppercase text-[var(--color-text-muted)]">Combined marks</p>
                          <p className="mt-2 text-4xl font-black text-[var(--color-heading)]">
                            {resultSheet.totals.obtainedMarks}
                            <span className="text-xl text-[var(--color-text-muted)]">/{resultSheet.totals.totalMarks}</span>
                          </p>
                        </div>
                        <progress
                          className="ui-progress ui-progress-heading h-3 w-full"
                          max="100"
                          value={Math.max(0, Math.min(100, resultSheet.overallPercentage))}
                          aria-label="Overall percentage"
                        />
                        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
                          Published across {resultSheet.subjects.length} enrolled {resultSheet.subjects.length === 1 ? 'subject' : 'subjects'} for this exam.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {resultMetrics({ resultSheet, selectedExamType }).map((metric) => {
                    const Icon = metric.icon
                    return (
                      <div key={metric.label} className="rounded-3xl border border-slate-200 bg-white p-5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[var(--color-text-muted)]">{metric.label}</p>
                          <Icon className="h-4 w-4 text-[var(--color-text-muted)]" />
                        </div>
                        <p className="mt-3 text-2xl font-black text-[var(--color-heading)]">{metric.value}</p>
                      </div>
                    )
                  })}
                </div>

                <div className="mb-6">
                  <section className="rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-[var(--color-heading)]">
                        <BookOpenCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--color-heading)]">Subject Summary</h2>
                        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Grades and grade points by subject.</p>
                      </div>
                    </div>
                    <div className="mt-5 divide-y divide-slate-100">
                      {resultSheet.subjects.map((subject) => (
                        <div key={subject.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--color-heading)]">{subject.subjectName}</p>
                            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{subject.subjectCode}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${gradeTone(subject.grade)}`}>
                              {subject.grade}
                            </span>
                            <span className="text-sm font-bold text-[var(--color-heading)]">{subject.gradePoint.toFixed(1)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 p-6">
                    <h2 className="text-lg font-semibold text-[var(--color-heading)]">Detailed Result</h2>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      Published marks for each subject in the selected exam.
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100 md:hidden">
                    {resultSheet.subjects.map((subject) => (
                      <div key={subject.id} className="p-5">
                        <p className="font-semibold text-[var(--color-heading)]">{subject.subjectName}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{subject.subjectCode}</p>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-[var(--color-text-muted)]">Marks</p>
                            <p className="font-bold text-[var(--color-heading)]">{subject.obtainedMarks}/{subject.totalMarks}</p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--color-text-muted)]">Percentage</p>
                            <p className="font-bold text-[var(--color-heading)]">{subject.percentage}%</p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--color-text-muted)]">Grade</p>
                            <p className="font-bold text-[var(--color-heading)]">{subject.grade}</p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--color-text-muted)]">GPA</p>
                            <p className="font-bold text-[var(--color-heading)]">{subject.gradePoint.toFixed(1)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[760px]">
                      <thead className="bg-slate-50">
                        <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                          <th scope="col" className="px-6 py-4">Subject</th>
                          <th scope="col" className="px-6 py-4">Marks</th>
                          <th scope="col" className="px-6 py-4">Percentage</th>
                          <th scope="col" className="px-6 py-4">Grade</th>
                          <th scope="col" className="px-6 py-4">GPA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultSheet.subjects.map((subject) => (
                          <tr key={subject.id} className="border-t border-slate-100">
                            <td className="px-6 py-4">
                              <p className="font-medium text-[var(--color-heading)]">{subject.subjectName}</p>
                              <p className="text-xs text-[var(--color-text-muted)]">{subject.subjectCode}</p>
                            </td>
                            <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{subject.obtainedMarks}/{subject.totalMarks}</td>
                            <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{subject.percentage}%</td>
                            <td className="px-6 py-4">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${gradeTone(subject.grade)}`}>
                                {subject.grade}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-[var(--color-heading)]">{subject.gradePoint.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </StudentLayout>
  )
}

export default StudentMarks
