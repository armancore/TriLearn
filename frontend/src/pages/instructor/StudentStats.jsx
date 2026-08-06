import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Users } from 'lucide-react'
import InstructorLayout from '../../layouts/InstructorLayout'
import PageHeader from '../../components/PageHeader'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import EmptyState from '../../components/EmptyState'
import Alert from '../../components/Alert'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'
import { isRequestCanceled } from '../../utils/http'

const StudentStats = () => {
  const [subjects, setSubjects] = useState([])
  const [subjectStudents, setSubjectStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadStudentStats = useCallback(async (signal) => {
    try {
      setLoading(true)
      setError('')

      const response = await api.get('/instructor/students', { signal })
      setSubjects(response.data.subjects || [])
      setSubjectStudents(response.data.students || [])
    } catch (requestError) {
      if (isRequestCanceled(requestError)) return
      setError(getFriendlyErrorMessage(requestError, 'Unable to load student stats right now.'))
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadStudentStats(controller.signal)
    return () => controller.abort()
  }, [loadStudentStats])

  const students = subjectStudents

  return (
    <InstructorLayout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Student Stats"
          subtitle="View students enrolled in your assigned modules and open their full profile stats."
          breadcrumbs={['Instructor', 'Student Stats']}
        />

        <Alert type="error" message={error} />

        {loading ? (
          <LoadingSkeleton rows={6} itemClassName="h-16" />
        ) : students.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No students found"
            description={subjects.length === 0 ? 'Assigned modules will appear here first.' : 'No active students are enrolled in your assigned modules yet.'}
          />
        ) : (
          <section className="overflow-hidden rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] shadow-sm dark:shadow-slate-900/50">
            <div className="flex items-center justify-between border-b border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">Students</h2>
                <p className="text-sm text-[var(--color-text-muted)]">{subjects.length} modules in scope</p>
              </div>
              <span className="ui-status-badge ui-status-neutral">{students.length} records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="bg-[var(--color-surface-muted)]">
                  <tr className="text-left text-sm text-[var(--color-text-muted)]">
                    <th scope="col" className="px-6 py-4">Student</th>
                    <th scope="col" className="px-6 py-4">Roll number</th>
                    <th scope="col" className="px-6 py-4">Email</th>
                    <th scope="col" className="px-6 py-4">Department</th>
                    <th scope="col" className="px-6 py-4">Semester</th>
                    <th scope="col" className="px-6 py-4">Section</th>
                    <th scope="col" className="px-6 py-4">Modules</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id} className="border-t border-[var(--color-card-border)] transition-colors hover:bg-[var(--color-surface-muted)]/70">
                      <td className="px-6 py-4">
                        <Link
                          to={`/instructor/students/${student.id}/profile`}
                          className="font-medium text-[var(--color-role-accent)] hover:underline"
                        >
                          {student.name}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{student.rollNumber}</td>
                      <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{student.email}</td>
                      <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{student.department}</td>
                      <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{student.semester}</td>
                      <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{student.section || '-'}</td>
                      <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">
                        {student.subjects.map((subject) => subject.code || subject.name).filter(Boolean).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </InstructorLayout>
  )
}

export default StudentStats
