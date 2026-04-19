import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import Alert from '../../components/Alert'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import { useAuth } from '../../context/AuthContext'
import { useReferenceData } from '../../context/ReferenceDataContext'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'
import { isRequestCanceled } from '../../utils/http'

const StudentApplications = () => {
  const { user } = useAuth()
  const isCoordinator = user?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : AdminLayout
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [total, setTotal] = useState(0)
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [deletingApplication, setDeletingApplication] = useState(false)
  const { departments, loadDepartments } = useReferenceData()
  const [applicationToDelete, setApplicationToDelete] = useState(null)
  const [accountForm, setAccountForm] = useState({
    studentId: '',
    department: '',
    semester: '1',
    section: ''
  })

  useEffect(() => {
    void loadDepartments().catch((requestError) => {
      setError(getFriendlyErrorMessage(requestError, 'Unable to load departments right now.'))
    })
  }, [loadDepartments])

  const fetchApplications = useCallback(async (signal) => {
    try {
      setLoading(true)
      setError('')
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (filterStatus) params.set('status', filterStatus)
      const res = await api.get(`/admin/student-applications?${params.toString()}`, { signal })
      setApplications(res.data.applications)
      setTotal(res.data.total)
    } catch (requestError) {
      if (isRequestCanceled(requestError)) return
      setError(getFriendlyErrorMessage(requestError, 'Unable to load student applications right now.'))
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [filterStatus, limit, page])

  useEffect(() => {
    const controller = new AbortController()
    void fetchApplications(controller.signal)
    return () => controller.abort()
  }, [fetchApplications])

  const openApplication = (application) => {
    const matchingDepartment = departments.find((department) => (
      department.name === application.preferredDepartment || department.code === application.preferredDepartment
    ))

    setSelectedApplication(application)
    setAccountForm({
      studentId: '',
      department: matchingDepartment?.name || '',
      semester: '1',
      section: ''
    })
    setError('')
  }

  const markReviewed = async (applicationId) => {
    try {
      await api.patch(`/admin/student-applications/${applicationId}/status`, { status: 'REVIEWED' })
      setSuccess('Application marked as reviewed.')
      fetchApplications()
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to update the application status right now.'))
    }
  }

  const createAccount = async () => {
    if (!selectedApplication) return
    if (!accountForm.studentId.trim()) {
      setError('Please enter the institution student ID before creating the account.')
      return
    }
    if (!accountForm.department.trim()) {
      setError('Please select a valid department before creating the account.')
      return
    }
    try {
      setCreatingAccount(true)
      setError('')
      const res = await api.post(`/admin/student-applications/${selectedApplication.id}/create-account`, {
        studentId: accountForm.studentId,
        department: accountForm.department,
        semester: parseInt(accountForm.semester, 10),
        section: accountForm.section
      })
      setSuccess(
        res.data.welcomeEmailSent
          ? `Student account created. Login email: ${res.data.user.email}. Temporary login instructions were sent by email.`
          : `Student account created. Login email: ${res.data.user.email}. The welcome email could not be delivered.`
      )
      setSelectedApplication(null)
      fetchApplications()
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to create the student account right now.'))
    } finally {
      setCreatingAccount(false)
    }
  }

  const deleteApplication = async () => {
    if (!applicationToDelete) return

    try {
      setDeletingApplication(true)
      setError('')
      await api.delete(`/admin/student-applications/${applicationToDelete.id}`)
      setSuccess('Student application deleted successfully.')
      if (selectedApplication?.id === applicationToDelete.id) {
        setSelectedApplication(null)
      }
      setApplicationToDelete(null)
      fetchApplications()
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to delete the student application right now.'))
    } finally {
      setDeletingApplication(false)
    }
  }

  return (
    <Layout>
      <div className="admin-page p-8">
        <PageHeader
          title="Student Intake Forms"
          subtitle="Review student-submitted admission details and create portal accounts from approved forms."
          breadcrumbs={['Admin', 'Admissions']}
          actions={[{ label: 'Open Public Form', icon: ExternalLink, variant: 'primary', href: '/student-intake', target: '_blank', rel: 'noreferrer' }]}
        />

        <Alert type="success" message={success} />
        <Alert type="error" message={error} />

        <div className="mb-6 flex gap-3">
          {['', 'PENDING', 'REVIEWED', 'CONVERTED'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setFilterStatus(status)
                setPage(1)
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${filterStatus === status ? 'ui-role-fill' : 'ui-card text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'}`}
            >
              {status || 'All'}
            </button>
          ))}
        </div>

        <div className="ui-card rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-6">
              <LoadingSkeleton rows={5} itemClassName="h-20" />
            </div>
          ) : applications.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={FileText} title="No student forms yet" description="Open the public form link and submit a sample application to test the admissions workflow." />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead className="bg-[var(--color-surface-muted)]">
                    <tr className="text-left text-sm text-[var(--color-text-muted)]">
                      <th className="px-6 py-4">Student</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Requested</th>
                      <th className="px-6 py-4">Submitted</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((application) => (
                      <tr key={application.id} className="border-t border-[var(--color-card-border)] hover:bg-[var(--color-surface-muted)]">
                        <td className="px-6 py-4">
                          <p className="font-medium text-[var(--color-heading)]">{application.fullName}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{application.phone}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{application.email}</td>
                        <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">
                          {application.preferredDepartment} · First Semester Intake
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{new Date(application.createdAt).toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                            application.status === 'CONVERTED'
                              ? 'status-present'
                              : application.status === 'REVIEWED'
                                ? 'grade-merit'
                                : 'status-late'
                          }`}>
                            {application.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button type="button" onClick={() => openApplication(application)} className="grade-merit rounded-lg border px-3 py-1 text-xs font-medium">
                              View
                            </button>
                            {application.status === 'PENDING' ? (
                              <button type="button" onClick={() => markReviewed(application.id)} className="grade-merit rounded-lg border px-3 py-1 text-xs font-medium">
                                Mark Reviewed
                              </button>
                            ) : null}
                            <button type="button" onClick={() => setApplicationToDelete(application)} className="status-absent rounded-lg border px-3 py-1 text-xs font-medium">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
            </>
          )}
        </div>
      </div>

      {selectedApplication ? (
        <Modal title="Student Application Details" onClose={() => setSelectedApplication(null)}>
          <div className="space-y-4 text-sm text-[var(--color-text-muted)]">
            <div className="rounded-xl bg-[var(--color-surface-muted)] p-4">
              <p><span className="font-medium text-[var(--color-heading)]">Full Name:</span> {selectedApplication.fullName}</p>
              <p><span className="font-medium text-[var(--color-heading)]">Email:</span> {selectedApplication.email}</p>
              <p><span className="font-medium text-[var(--color-heading)]">Phone:</span> {selectedApplication.phone}</p>
              <p><span className="font-medium text-[var(--color-heading)]">Father:</span> {selectedApplication.fatherName} ({selectedApplication.fatherPhone})</p>
              <p><span className="font-medium text-[var(--color-heading)]">Mother:</span> {selectedApplication.motherName} ({selectedApplication.motherPhone})</p>
              <p><span className="font-medium text-[var(--color-heading)]">Blood Group:</span> {selectedApplication.bloodGroup || 'Not provided'}</p>
              <p><span className="font-medium text-[var(--color-heading)]">Local Guardian:</span> {selectedApplication.localGuardianName} ({selectedApplication.localGuardianPhone})</p>
              <p><span className="font-medium text-[var(--color-heading)]">Local Guardian Address:</span> {selectedApplication.localGuardianAddress}</p>
              <p><span className="font-medium text-[var(--color-heading)]">Permanent Address:</span> {selectedApplication.permanentAddress}</p>
              <p><span className="font-medium text-[var(--color-heading)]">Temporary Address:</span> {selectedApplication.temporaryAddress}</p>
              <p><span className="font-medium text-[var(--color-heading)]">Date of Birth:</span> {new Date(selectedApplication.dateOfBirth).toLocaleDateString()}</p>
              <p><span className="font-medium text-[var(--color-heading)]">Requested Class:</span> {selectedApplication.preferredDepartment} · First Semester Intake</p>
            </div>

            {selectedApplication.status !== 'CONVERTED' ? (
              <div className="space-y-3 rounded-xl border border-[var(--color-card-border)] p-4">
                <h3 className="font-semibold text-[var(--color-heading)]">Create Student Account</h3>
                {error ? <Alert type="error" message={error} /> : null}
                <input value={accountForm.studentId} onChange={(e) => setAccountForm((current) => ({ ...current, studentId: e.target.value }))} placeholder="Institution Student ID" className="ui-form-input" />
                <select value={accountForm.department} onChange={(e) => setAccountForm((current) => ({ ...current, department: e.target.value }))} className="ui-form-input">
                  <option value="">Select Department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.name}>
                      {department.name}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input value={accountForm.semester} disabled className="ui-form-input" />
                  <input value={accountForm.section} onChange={(e) => setAccountForm((current) => ({ ...current, section: e.target.value.toUpperCase() }))} placeholder="Section" className="ui-form-input" />
                </div>
                <button type="button" disabled={creatingAccount} onClick={createAccount} className="ui-role-fill w-full rounded-lg py-2 font-medium disabled:opacity-50">
                  {creatingAccount ? 'Creating Account...' : 'Create Student Account'}
                </button>
                <button type="button" onClick={() => setApplicationToDelete(selectedApplication)} className="status-absent w-full rounded-lg border py-2 font-medium">
                  Delete Application
                </button>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-[var(--color-card-border)] p-4">
                <div className="status-present rounded-xl border p-4 text-sm">
                  This application has already been converted into a student account.
                </div>
                <button type="button" onClick={() => setApplicationToDelete(selectedApplication)} className="status-absent w-full rounded-lg border py-2 font-medium">
                  Delete Application Record
                </button>
              </div>
            )}
          </div>
        </Modal>
      ) : null}

      {applicationToDelete ? (
        <Modal title="Delete Student Application" onClose={() => setApplicationToDelete(null)}>
          <div className="space-y-4 text-sm text-[var(--color-text-muted)]">
              <p>
                Delete the application for <span className="font-medium text-[var(--color-heading)]">{applicationToDelete.fullName}</span>?
              </p>
              <p>
                This should only be used for duplicate, test, or useless submissions.
              </p>
              {applicationToDelete.status === 'CONVERTED' ? (
                <p>
                  This will delete only the application record. The linked student account will remain in the system.
                </p>
              ) : null}
              <div className="flex gap-3">
              <button type="button" onClick={() => setApplicationToDelete(null)} className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]">
                Cancel
              </button>
              <button type="button" disabled={deletingApplication} onClick={deleteApplication} className="status-absent flex-1 rounded-lg border py-2 font-medium disabled:opacity-50">
                {deletingApplication ? 'Deleting...' : 'Delete Application'}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </Layout>
  )
}

export default StudentApplications
