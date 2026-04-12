import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import Alert from '../../components/Alert'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import useApi from '../../hooks/useApi'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'

const emptyForm = { name: '', code: '', description: '' }

const Departments = () => {
  const { user } = useAuth()
  const isCoordinator = user?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : AdminLayout
  const [showModal, setShowModal] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState(null)
  const [departmentToDelete, setDepartmentToDelete] = useState(null)
  const [deletingDepartment, setDeletingDepartment] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const { showToast } = useToast()
  const {
    data: departments = [],
    setData: setDepartments,
    loading,
    error,
    setError,
    execute
  } = useApi({ initialData: [], initialLoading: true })

  const fetchDepartments = useCallback(async () => {
    await execute(
      (signal) => api.get('/departments', { signal }),
      {
        fallbackMessage: 'Unable to load departments',
        transform: (response) => response.data.departments
      }
    )
  }, [execute])

  useEffect(() => {
    void fetchDepartments()
  }, [fetchDepartments])

  const openCreateModal = () => {
    setEditingDepartment(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  const openEditModal = (department) => {
    setEditingDepartment(department)
    setForm({
      name: department.name,
      code: department.code,
      description: department.description || ''
    })
    setError('')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      if (editingDepartment) {
        await api.put(`/departments/${editingDepartment.id}`, form)
        showToast({ title: 'Department updated successfully.' })
      } else {
        await api.post('/departments', form)
        showToast({ title: 'Department created successfully.' })
      }

      setShowModal(false)
      setForm(emptyForm)
      setEditingDepartment(null)
      await fetchDepartments()
    } catch (submitError) {
      setError(getFriendlyErrorMessage(submitError, 'Unable to save the department right now.'))
    }
  }

  const handleDelete = async () => {
    if (!departmentToDelete) return
    try {
      setDeletingDepartment(true)
      const target = departmentToDelete
      setDepartmentToDelete(null)
      setDepartments((current) => current.filter((department) => department.id !== target.id))
      await api.delete(`/departments/${target.id}`)
      showToast({ title: 'Department deleted successfully.' })
    } catch (deleteError) {
      await fetchDepartments()
      setError(getFriendlyErrorMessage(deleteError, 'Unable to delete the department right now.'))
    } finally {
      setDeletingDepartment(false)
    }
  }

  return (
    <Layout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Departments"
          subtitle="Create and manage the departments used across users and subjects."
          breadcrumbs={[isCoordinator ? 'Coordinator' : 'Admin', 'Departments']}
          actions={[{ label: 'Add Department', icon: Plus, variant: 'primary', onClick: openCreateModal }]}
        />

        <Alert type="error" message={error} />

        {loading ? (
          <LoadingSkeleton rows={6} itemClassName="h-44" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {departments.map((department) => (
              <div key={department.id} className="ui-card rounded-2xl p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="grade-merit rounded px-2 py-1 text-xs font-bold">
                      {department.code}
                    </span>
                    <h3 className="mt-2 font-semibold text-[var(--color-heading)]">{department.name}</h3>
                  </div>
                </div>

                {department.description && (
                  <p className="mb-4 line-clamp-3 text-sm text-[var(--color-text-muted)]">{department.description}</p>
                )}

                <div className="mb-4 flex gap-4 text-xs text-[var(--color-text-muted)]">
                  <span>👨‍🎓 {department._count?.students || 0} students</span>
                  <span>👩‍🏫 {department._count?.instructors || 0} instructors</span>
                  <span>📚 {department._count?.subjects || 0} subjects</span>
                </div>

                <div className="flex gap-2 border-t border-[var(--color-card-border)] pt-4">
                  <button
                    onClick={() => openEditModal(department)}
                    className="grade-merit flex-1 rounded-lg border py-2 text-xs font-medium transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDepartmentToDelete(department)}
                    className="status-absent flex-1 rounded-lg border py-2 text-xs font-medium transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {departments.length === 0 && (
              <div className="col-span-3">
                <EmptyState
                  icon="🏛️"
                  title="No departments yet"
                  description="Create your first department so students, instructors, and subjects can be organized properly."
                  action={(
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="ui-role-fill rounded-lg px-4 py-2 text-sm font-medium"
                    >
                      Add Department
                    </button>
                  )}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <Modal title={editingDepartment ? 'Edit Department' : 'Add Department'} onClose={() => setShowModal(false)}>
            <Alert type="error" message={error} />
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="ui-form-label">Department Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="ui-form-input"
                />
              </div>
              <div>
                <label className="ui-form-label">Department Code</label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="ui-form-input"
                />
              </div>
              <div>
                <label className="ui-form-label">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="ui-form-input"
                />
              </div>
              <div className="ui-modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]">
                  Cancel
                </button>
                <button type="submit" className="ui-role-fill flex-1 rounded-lg py-2 text-sm font-medium">
                  {editingDepartment ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      <ConfirmDialog
        open={!!departmentToDelete}
        title="Delete Department"
        message={departmentToDelete
          ? `Delete ${departmentToDelete.name}? This only works when no users or subjects still depend on it.`
          : ''}
        confirmText="Delete Department"
        busy={deletingDepartment}
        onClose={() => setDepartmentToDelete(null)}
        onConfirm={handleDelete}
      />
    </Layout>
  )
}

export default Departments


