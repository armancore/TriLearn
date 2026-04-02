import { Search, BookOpenText, CheckCircle2, Clock3, Percent, Mail, IdCard, Sparkles } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import ModuleCard from '../components/ModuleCard'
import StatsStrip from '../components/StatsStrip'
import StudentLayout from '../layouts/StudentLayout'
import { useAuth } from '../context/AuthContext'
import LoadingSkeleton from '../components/LoadingSkeleton'
import api from '../utils/api'
import logger from '../utils/logger'

const Learnings = () => {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState([])
  const [attendanceSummary, setAttendanceSummary] = useState([])
  const [assignmentCount, setAssignmentCount] = useState(0)
  const [noticeCount, setNoticeCount] = useState(0)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    const fetchLearnings = async () => {
      try {
        setLoading(true)
        const [subjectsRes, attendanceRes, assignmentsRes, noticesRes] = await Promise.all([
          api.get('/subjects'),
          api.get('/attendance/my'),
          api.get('/assignments'),
          api.get('/notices')
        ])

        setSubjects(subjectsRes.data.subjects || [])
        setAttendanceSummary(attendanceRes.data.summary || [])
        setAssignmentCount(assignmentsRes.data.total ?? assignmentsRes.data.assignments?.length ?? 0)
        setNoticeCount(noticesRes.data.total ?? noticesRes.data.notices?.length ?? 0)
      } catch (error) {
        logger.error('Failed to load student learnings', error)
      } finally {
        setLoading(false)
      }
    }

    void fetchLearnings()
  }, [])

  const modules = useMemo(() => {
    const attendanceBySubjectCode = new Map(
      attendanceSummary.map((entry) => [entry.code, Number.parseFloat(entry.percentage) || 0])
    )

    return subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      code: subject.code,
      year: subject.semester,
      progress: attendanceBySubjectCode.get(subject.code) ?? 0,
      description: subject.description || `Semester ${subject.semester} subject${subject.department ? ` for ${subject.department}` : ''}.`
    }))
  }, [attendanceSummary, subjects])

  const filteredModules = modules.filter((module) => {
    const value = deferredQuery.trim().toLowerCase()
    if (!value) return true

    return [module.name, module.code, String(module.year)]
      .join(' ')
      .toLowerCase()
      .includes(value)
  })

  const completedCount = modules.filter((module) => module.progress >= 80).length
  const pendingCount = modules.filter((module) => module.progress < 80).length
  const averageProgress = modules.length > 0
    ? Math.round(modules.reduce((sum, module) => sum + module.progress, 0) / modules.length)
    : 0

  const stats = [
    { label: 'Total Enrolled', value: modules.length, help: 'Active modules this term', icon: BookOpenText, color: 'from-violet-500 to-fuchsia-500' },
    { label: 'On Track', value: completedCount, help: 'Subjects above 80% attendance', icon: CheckCircle2, color: 'from-emerald-500 to-cyan-500' },
    { label: 'Needs Focus', value: pendingCount, help: 'Subjects under 80% attendance', icon: Clock3, color: 'from-amber-400 to-orange-500' },
    { label: 'Attendance', value: `${averageProgress}%`, help: 'Current attendance average', icon: Percent, color: 'from-blue-500 to-indigo-500' }
  ]

  return (
    <StudentLayout noticesCount={noticeCount}>
      <div className="space-y-6 p-1">
        {loading ? (
          <LoadingSkeleton rows={5} itemClassName="h-32" />
        ) : (
          <>
            <StatsStrip items={stats} />

            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.65fr)_360px]">
              <div className="space-y-6">
                <motion.section
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-slate-600">
                        <Sparkles className="h-3.5 w-3.5" />
                        Academic Pulse
                      </p>
                      <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900">My Learnings</h2>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        Track the subjects you are enrolled in, monitor progress at a glance, and quickly focus on the modules that need more attention this week.
                      </p>
                    </div>

                    <label className="flex w-full max-w-md items-center gap-3 rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
                      <Search className="h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search modules by name, code, or year"
                        className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      />
                    </label>
                  </div>
                </motion.section>

                <div className="grid gap-5 lg:grid-cols-2">
                  {filteredModules.map((module, index) => (
                    <ModuleCard key={module.id} module={module} index={index} />
                  ))}
                </div>

                {filteredModules.length === 0 ? (
                  <div className="rounded-[1.8rem] border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-slate-600">
                    No modules matched <span className="font-semibold text-slate-900">{deferredQuery}</span>.
                  </div>
                ) : null}
              </div>

              <div className="space-y-6">
                <motion.aside
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-slate-900 text-2xl font-black text-white">
                      {(user?.name || 'Student User')
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase())
                        .join('')}
                    </div>
                    <h3 className="mt-4 text-2xl font-black tracking-tight text-slate-900">{user?.name || 'Student User'}</h3>
                    <p className="mt-1 text-sm text-slate-500">{user?.student?.department || 'Student'}</p>
                  </div>

                  <div className="mt-6 space-y-3">
                    <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-3 text-slate-600">
                        <Mail className="h-4 w-4 text-slate-500" />
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Email</p>
                          <p className="mt-1 text-sm font-medium text-slate-900">{user?.email || 'student@edunexus.edu'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-3 text-slate-600">
                        <IdCard className="h-4 w-4 text-slate-500" />
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Student ID</p>
                          <p className="mt-1 text-sm font-medium text-slate-900">{user?.student?.rollNumber || 'Not assigned yet'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-600">Performance Snapshot</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3 2xl:grid-cols-1">
                      <div>
                        <p className="text-2xl font-black text-slate-900">{averageProgress}%</p>
                        <p className="text-sm text-slate-600">Average attendance</p>
                      </div>
                      <div>
                        <p className="text-2xl font-black text-slate-900">{assignmentCount}</p>
                        <p className="text-sm text-slate-600">Assignments available</p>
                      </div>
                      <div>
                        <p className="text-2xl font-black text-slate-900">{noticeCount}</p>
                        <p className="text-sm text-slate-600">Recent notices</p>
                      </div>
                    </div>
                  </div>

                </motion.aside>
              </div>
            </div>
          </>
        )}
      </div>
    </StudentLayout>
  )
}

export default Learnings
