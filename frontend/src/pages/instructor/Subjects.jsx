import { useState, useEffect, useCallback } from 'react'
import { BookOpenText, ClipboardList, Files, GraduationCap, Percent, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import InstructorLayout from '../../layouts/InstructorLayout'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import api from '../../utils/api'
import logger from '../../utils/logger'

const initialsFromName = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'IN'

const departmentBar = (department = '') => {
  const key = department.toLowerCase()
  if (key.includes('science') || key.includes('computer')) return 'from-blue-500 to-cyan-600'
  if (key.includes('management') || key.includes('business')) return 'from-emerald-500 to-green-600'
  if (key.includes('human') || key.includes('arts')) return 'from-purple-500 to-fuchsia-600'
  return 'from-amber-500 to-orange-500'
}
const InstructorSubjects = () => {
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchSubjects = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/subjects')
      setSubjects(res.data.subjects)
    } catch (error) {
      logger.error('Failed to load instructor subjects', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSubjects()
  }, [fetchSubjects])

  return (
    <InstructorLayout>
      <div className="p-8">
        <PageHeader
          title="My Modules"
          subtitle="Open a module, manage its study materials, track attendance, and handle assignments from one place."
          breadcrumbs={['Instructor', 'Modules']}
        />

        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subject) => (
              <div key={subject.id} className="ui-card ui-card-hover overflow-hidden rounded-2xl">
                <div className={`h-1.5 bg-gradient-to-r ${departmentBar(subject.department)}`} />
                <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                    <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">
                      {subject.code}
                    </span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                    Sem {subject.semester}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-800 mb-2">{subject.name}</h3>
                {subject.description && (
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2">{subject.description}</p>
                )}
                <div className="mb-3 flex flex-wrap gap-2 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                    <ClipboardList className="h-3.5 w-3.5" />
                    <span>{subject._count?.assignments} assignments</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                    <Files className="h-3.5 w-3.5" />
                    <span>{subject._count?.materials} materials</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                    <Users className="h-3.5 w-3.5" />
                    <span>{subject._count?.enrollments || 0} students</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                    <Percent className="h-3.5 w-3.5" />
                    <span>{subject._count?.attendances} attendance records</span>
                  </span>
                </div>
                {subject.department && (
                  <span className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded">
                    {subject.department}
                  </span>
                )}
                <div className="mt-5 flex items-center gap-3 border-t border-slate-200 pt-4">
                  <div className="ui-role-fill flex h-10 w-10 items-center justify-center rounded-full text-xs font-black text-white">
                    {initialsFromName(subject.instructor?.user?.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">Instructor</p>
                    <p className="truncate text-sm font-semibold text-slate-900">{subject.instructor?.user?.name || 'Assigned instructor'}</p>
                  </div>
                  <GraduationCap className="ml-auto h-5 w-5 text-slate-300" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link
                    to={`/instructor/materials?subject=${subject.id}`}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Materials
                  </Link>
                  <Link
                    to={`/instructor/assignments?subject=${subject.id}`}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Assignments
                  </Link>
                  <Link
                    to={`/instructor/attendance?subject=${subject.id}&semester=${subject.semester}`}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Attendance
                  </Link>
                  <Link
                    to={`/instructor/marks?subject=${subject.id}`}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Exam Marks
                  </Link>
                </div>
                </div>
              </div>
            ))}
            {subjects.length === 0 && (
              <div className="col-span-3">
                <EmptyState
                  icon="📚"
                  title="No subjects assigned yet"
                  description="Assigned modules will appear here once an admin or coordinator links them to your account."
                />
              </div>
            )}
          </div>
        )}
      </div>
    </InstructorLayout>
  )
}

export default InstructorSubjects



