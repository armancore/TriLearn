import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import Alert from '../../components/Alert'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import { useReferenceData } from '../../context/ReferenceDataContext'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'

const StudentApplications = () => {
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
    fetchApplications()
  }, [page, filterStatus])

  useEffect(() => {
    void loadDepartments().catch((requestError) => {
      setError(getFriendlyErrorMessage(requestError, 'Unable to load departments right now.'))
    })
  }, [loadDepartments])

  const fetchApplications = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (filterStatus) params.set('status', filterStatus)
      const res = await api.get(`/admin/student-applications?${params.toString()}`)
      setApplications(res.data.applications)
      setTotal(res.data.total)
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to load student applications right now.'))
    } finally {
      setLoading(false)
    }
  }

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
      setSuccess(`Student account created. Login email: ${res.data.user.email}. The student must change the temporary password on first login.`)
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
    <AdminLayout>
      <div className="p-8">
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
              className={`rounded-lg px-4 py-2 text-sm font-medium ${filterStatus === status ? 'bg-blue-600 text-white' : 'border bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {status || 'All'}
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6">
              <LoadingSkeleton rows={5} itemClassName="h-20" />
            </div>
          ) : applications.length === 0 ? (
            <div className="p-6">
              <EmptyState icon="🧾" title="No student forms yet" description="Open the public form link and submit a sample application to test the admissions workflow." />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-sm text-gray-500">
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
                      <tr key={application.id} className="border-t hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-800">{application.fullName}</p>
                          <p className="mt-1 text-xs text-gray-500">{application.phone}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">{application.email}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {application.preferredDepartment} · First Semester Intake
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">{new Date(application.createdAt).toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                            application.status === 'CONVERTED'
                              ? 'bg-green-100 text-green-700'
                              : application.status === 'REVIEWED'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}>
                            {application.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button type="button" onClick={() => openApplication(application)} className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100">
                              View
                            </button>
                            {application.status === 'PENDING' ? (
                              <button type="button" onClick={() => markReviewed(application.id)} className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100">
                                Mark Reviewed
                              </button>
                            ) : null}
                            <button type="button" onClick={() => setApplicationToDelete(application)} className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100">
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
          <div className="space-y-4 text-sm text-gray-600">
            <div className="rounded-xl bg-gray-50 p-4">
              <p><span className="font-medium text-gray-800">Full Name:</span> {selectedApplication.fullName}</p>
              <p><span className="font-medium text-gray-800">Email:</span> {selectedApplication.email}</p>
              <p><span className="font-medium text-gray-800">Phone:</span> {selectedApplication.phone}</p>
              <p><span className="font-medium text-gray-800">Father:</span> {selectedApplication.fatherName} ({selectedApplication.fatherPhone})</p>
              <p><span className="font-medium text-gray-800">Mother:</span> {selectedApplication.motherName} ({selectedApplication.motherPhone})</p>
              <p><span className="font-medium text-gray-800">Blood Group:</span> {selectedApplication.bloodGroup || 'Not provided'}</p>
              <p><span className="font-medium text-gray-800">Local Guardian:</span> {selectedApplication.localGuardianName} ({selectedApplication.localGuardianPhone})</p>
              <p><span className="font-medium text-gray-800">Local Guardian Address:</span> {selectedApplication.localGuardianAddress}</p>
              <p><span className="font-medium text-gray-800">Permanent Address:</span> {selectedApplication.permanentAddress}</p>
              <p><span className="font-medium text-gray-800">Temporary Address:</span> {selectedApplication.temporaryAddress}</p>
              <p><span className="font-medium text-gray-800">Date of Birth:</span> {new Date(selectedApplication.dateOfBirth).toLocaleDateString()}</p>
              <p><span className="font-medium text-gray-800">Requested Class:</span> {selectedApplication.preferredDepartment} · First Semester Intake</p>
            </div>

            {selectedApplication.status !== 'CONVERTED' ? (
              <div className="space-y-3 rounded-xl border p-4">
                <h3 className="font-semibold text-gray-800">Create Student Account</h3>
                {error ? <Alert type="error" message={error} /> : null}
                <input value={accountForm.studentId} onChange={(e) => setAccountForm((current) => ({ ...current, studentId: e.target.value }))} placeholder="Institution Student ID" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
                <select value={accountForm.department} onChange={(e) => setAccountForm((current) => ({ ...current, department: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2">
                  <option value="">Select Department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.name}>
                      {department.name}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input value={accountForm.semester} disabled className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-gray-500" />
                  <input value={accountForm.section} onChange={(e) => setAccountForm((current) => ({ ...current, section: e.target.value.toUpperCase() }))} placeholder="Section" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
                </div>
                <button type="button" disabled={creatingAccount} onClick={createAccount} className="w-full rounded-lg bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {creatingAccount ? 'Creating Account...' : 'Create Student Account'}
                </button>
                <button type="button" onClick={() => setApplicationToDelete(selectedApplication)} className="w-full rounded-lg bg-red-50 py-2 font-medium text-red-600 hover:bg-red-100">
                  Delete Application
                </button>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border p-4">
                <div className="rounded-xl bg-green-50 p-4 text-sm text-green-700">
                  This application has already been converted into a student account.
                </div>
                <button type="button" onClick={() => setApplicationToDelete(selectedApplication)} className="w-full rounded-lg bg-red-50 py-2 font-medium text-red-600 hover:bg-red-100">
                  Delete Application Record
                </button>
              </div>
            )}
          </div>
        </Modal>
      ) : null}

      {applicationToDelete ? (
        <Modal title="Delete Student Application" onClose={() => setApplicationToDelete(null)}>
          <div className="space-y-4 text-sm text-gray-600">
              <p>
                Delete the application for <span className="font-medium text-gray-800">{applicationToDelete.fullName}</span>?
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
              <button type="button" onClick={() => setApplicationToDelete(null)} className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" disabled={deletingApplication} onClick={deleteApplication} className="flex-1 rounded-lg bg-red-600 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {deletingApplication ? 'Deleting...' : 'Delete Application'}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </AdminLayout>
  )
}

export default StudentApplications
