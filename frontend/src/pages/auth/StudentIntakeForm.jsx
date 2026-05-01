import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BookOpenCheck,
  ClipboardPenLine,
  HeartPulse,
  Home,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
  UserRoundCheck,
  CalendarDays,
  Users
} from 'lucide-react'
import Alert from '../../components/Alert'
import AuthSplitLayout from '../../components/AuthSplitLayout'
import ConfirmDialog from '../../components/ConfirmDialog'
import useForm from '../../hooks/useForm'
import useUnsavedChangesGuard from '../../hooks/useUnsavedChangesGuard'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'
import { isRequestCanceled } from '../../utils/http'

const initialValues = {
  fullName: '',
  email: '',
  phone: '',
  fatherName: '',
  motherName: '',
  fatherPhone: '',
  motherPhone: '',
  bloodGroup: '',
  localGuardianName: '',
  localGuardianAddress: '',
  localGuardianPhone: '',
  permanentAddress: '',
  temporaryAddress: '',
  dateOfBirth: '',
  preferredDepartment: ''
}

const minDateOfBirth = new Date(Date.UTC(1920, 0, 1))

const parseDateOnlyToUtc = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim())
  if (!match) return null

  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return parsed
}

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())

const todayUtc = () => {
  const today = new Date()
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
}

const getServerFieldErrors = (error) => {
  const fieldErrors = error?.response?.data?.errors?.fieldErrors
  if (!fieldErrors || typeof fieldErrors !== 'object') return {}

  return Object.entries(fieldErrors).reduce((acc, [field, messages]) => {
    const message = Array.isArray(messages) ? messages.find(Boolean) : messages
    if (message) acc[field] = message
    return acc
  }, {})
}

const sectionMeta = [
  {
    id: 'identity',
    step: '01',
    title: 'Identity and contact',
    description: 'Start with the personal details the institution will use for your first student record.',
    toneClassName: 'bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_70%)]',
    iconClassName: 'bg-accent-100 text-accent-700 ring-1 ring-amber-200',
    icon: ShieldCheck
  },
  {
    id: 'guardians',
    step: '02',
    title: 'Family and guardian information',
    description: 'Add trusted contact details so communication stays clear from the start.',
    toneClassName: 'bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_70%)]',
    iconClassName: 'bg-primary-100 text-primary ring-1 ring-primary-200',
    icon: Users
  },
  {
    id: 'academic',
    step: '03',
    title: 'Academic preference',
    description: 'Choose the department you are applying to and share any optional health detail.',
    toneClassName: 'bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_70%)]',
    iconClassName: 'bg-primary-100 text-primary ring-1 ring-primary-200',
    icon: BookOpenCheck
  },
  {
    id: 'address',
    step: '04',
    title: 'Address details',
    description: 'Complete the final record with your permanent and current address information.',
    toneClassName: 'bg-[linear-gradient(135deg,#faf5ff_0%,#ffffff_70%)]',
    iconClassName: 'bg-primary-100 text-primary ring-1 ring-primary-200',
    icon: Home
  }
]

const StudentIntakeForm = () => {
  const [departments, setDepartments] = useState([])
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingDepartments, setLoadingDepartments] = useState(true)
  const features = [
    {
      icon: ClipboardPenLine,
      title: 'Capture admission details once',
      description: 'Collect complete first-semester student information before portal accounts are created.'
    },
    {
      icon: UserRoundCheck,
      title: 'Keep guardians in the loop',
      description: 'Record family and local guardian contacts in one reliable onboarding workflow.'
    },
    {
      icon: BookOpenCheck,
      title: 'Prepare academic placement',
      description: 'Share department preference and profile details early so setup is smoother for everyone.'
    }
  ]
  const { values, errors, handleChange, handleSubmit, setValues, setErrors } = useForm(initialValues, (formValues) => {
    const validationErrors = {}
    const requiredFields = {
      fullName: { min: 2, message: 'Full name must be at least 2 characters' },
      email: { min: 1, message: 'Email is required' },
      phone: { min: 7, message: 'Phone number must be at least 7 characters' },
      fatherName: { min: 2, message: 'Father name must be at least 2 characters' },
      motherName: { min: 2, message: 'Mother name must be at least 2 characters' },
      fatherPhone: { min: 7, message: 'Father contact number must be at least 7 characters' },
      motherPhone: { min: 7, message: 'Mother contact number must be at least 7 characters' },
      localGuardianName: { min: 2, message: 'Local guardian name must be at least 2 characters' },
      localGuardianAddress: { min: 5, message: 'Local guardian address must be at least 5 characters' },
      localGuardianPhone: { min: 7, message: 'Local guardian contact number must be at least 7 characters' },
      permanentAddress: { min: 5, message: 'Permanent address must be at least 5 characters' },
      temporaryAddress: { min: 5, message: 'Temporary address must be at least 5 characters' },
      preferredDepartment: { min: 2, message: 'Please select a department' }
    }

    Object.entries(requiredFields).forEach(([field, rule]) => {
      const value = String(formValues[field] || '').trim()
      if (!value) {
        validationErrors[field] = 'This field is required'
      } else if (value.length < rule.min) {
        validationErrors[field] = rule.message
      }
    })

    if (formValues.email && !isValidEmail(formValues.email)) {
      validationErrors.email = 'Please enter a valid email address'
    }

    const parsedDateOfBirth = parseDateOnlyToUtc(formValues.dateOfBirth)
    if (!String(formValues.dateOfBirth || '').trim()) {
      validationErrors.dateOfBirth = 'This field is required'
    } else if (!parsedDateOfBirth) {
      validationErrors.dateOfBirth = 'Date of birth must be a real calendar date'
    } else if (parsedDateOfBirth < minDateOfBirth || parsedDateOfBirth > todayUtc()) {
      validationErrors.dateOfBirth = 'Date of birth must be between 1920-01-01 and today'
    }

    const hasMatchingDepartment = departments.some((department) => department.name === formValues.preferredDepartment)
    if (formValues.preferredDepartment && !hasMatchingDepartment) {
      validationErrors.preferredDepartment = 'Please select a valid department'
    }

    return validationErrors
  })

  useEffect(() => {
    const controller = new AbortController()

    api.get('/departments/public', { signal: controller.signal })
      .then((response) => {
        setDepartments(response.data.departments || [])
      })
      .catch((requestError) => {
        if (isRequestCanceled(requestError) || controller.signal.aborted) return
        setError(getFriendlyErrorMessage(requestError, 'Unable to load departments right now.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingDepartments(false)
        }
      })

    return () => controller.abort()
  }, [])

  const hasUnsavedChanges = useMemo(() => (
    Object.entries(initialValues).some(([key, initialValue]) => String(values[key] || '') !== String(initialValue || ''))
  ), [values])
  const { dialogOpen, leavePage, stayOnPage } = useUnsavedChangesGuard(hasUnsavedChanges && !loading)

  const onSubmit = async () => {
    try {
      setLoading(true)
      setError('')
      setSuccess('')
      const payload = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      )
      await api.post('/auth/student-intake', payload)
      setSuccess('Your student details have been submitted successfully. The institution can now review them and create your account.')
      setValues(initialValues)
    } catch (requestError) {
      const fieldErrors = getServerFieldErrors(requestError)
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors)
      }
      setError(getFriendlyErrorMessage(requestError, 'Unable to submit your form right now.'))
    } finally {
      setLoading(false)
    }
  }

  const applicantFields = [
    { name: 'fullName', label: 'Full Name', placeholder: 'Enter full name', icon: User },
    { name: 'email', label: 'Personal Email', placeholder: 'Enter personal email', type: 'email', icon: Mail },
    { name: 'phone', label: 'Phone Number', placeholder: 'Enter phone number', icon: Phone },
    { name: 'dateOfBirth', label: 'Date of Birth', type: 'date', icon: CalendarDays }
  ]

  const guardianFields = [
    { name: 'fatherName', label: 'Father Name', placeholder: 'Enter father name', icon: User },
    { name: 'fatherPhone', label: 'Father Contact Number', placeholder: 'Enter father contact number', icon: Phone },
    { name: 'motherName', label: 'Mother Name', placeholder: 'Enter mother name', icon: User },
    { name: 'motherPhone', label: 'Mother Contact Number', placeholder: 'Enter mother contact number', icon: Phone },
    { name: 'localGuardianName', label: 'Local Guardian Name', placeholder: 'Enter local guardian name', icon: User },
    { name: 'localGuardianPhone', label: 'Local Guardian Contact Number', placeholder: 'Enter local guardian contact number', icon: Phone }
  ]

  const renderSectionHeader = (section) => {
    const Icon = section.icon

    return (
      <div className={`rounded-[1.1rem] px-4 py-4 sm:px-5 ${section.toneClassName}`}>
        <div className="flex items-start gap-3 sm:gap-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[--color-bg-card] dark:bg-slate-800/90 ${section.iconClassName}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-soft)]">Section {section.step}</p>
            <h5 className="ui-heading-tight mt-1 text-lg font-semibold text-[var(--color-heading)] sm:text-xl">{section.title}</h5>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{section.description}</p>
          </div>
        </div>
      </div>
    )
  }

  const renderInputField = ({ name, label, placeholder, type = 'text', icon: Icon }) => (
    <div key={name}>
      <label className="ui-form-label">{label}</label>
      <div className="relative">
        {Icon ? <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-soft)]" /> : null}
        <input
          name={name}
          type={type}
          value={values[name]}
          onChange={handleChange}
          placeholder={placeholder}
          className={`ui-form-input border-slate-200 bg-[--color-bg-card] dark:bg-slate-800 pl-11 shadow-[0_1px_2px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.9)] ${errors[name] ? 'ui-form-input-error' : ''}`}
        />
      </div>
      {errors[name] ? <p className="ui-form-helper-error">{errors[name]}</p> : null}
    </div>
  )

  const renderTextareaField = ({ name, label, placeholder }) => (
    <div key={name}>
      <label className="ui-form-label">{label}</label>
      <textarea
        name={name}
        value={values[name]}
        onChange={handleChange}
        placeholder={placeholder}
        rows={4}
        className={`ui-form-input min-h-28 border-slate-200 bg-[--color-bg-card] dark:bg-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.9)] ${errors[name] ? 'ui-form-input-error' : ''}`}
      />
      {errors[name] ? <p className="ui-form-helper-error">{errors[name]}</p> : null}
    </div>
  )

  return (
    <AuthSplitLayout
      title="A polished start for every new student."
      subtitle="Collect accurate student and guardian information in one guided experience before portal access is created."
      formTitle="Student Intake Form"
      formSubtitle="Designed for newly admitted first-semester students to complete in one sitting with clarity and confidence."
      features={features}
      contentWidthClassName="max-w-5xl"
      mainAlign="start"
      mainClassName="py-6 sm:py-8 lg:py-12"
      cardClassName="overflow-visible bg-white dark:bg-slate-800"
      hideAside
    >
      <div className="space-y-6 sm:space-y-8">
        <div className="rounded-[1.35rem] border border-slate-200 bg-[--color-bg-card] dark:bg-slate-800 px-5 py-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.28)] sm:rounded-[1.5rem] sm:px-8 sm:py-7">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-text-muted)]">
                <Sparkles className="h-3.5 w-3.5 text-[var(--color-text-soft)]" />
                Admissions Intake
              </div>
              <h3 className="ui-heading-tight mt-4 max-w-2xl text-2xl font-semibold leading-tight text-slate-950 sm:text-[2.15rem]">
                Student intake information
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-text-muted)] sm:text-base">
                Complete the required details below so the institution can review your admission record and prepare your student account accurately.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <span className="inline-flex items-center rounded-full bg-[var(--color-surface-muted)] px-3 py-1 text-sm font-medium text-[var(--color-page-text)] ring-1 ring-[var(--color-card-border)]">First-semester applicants</span>
                <span className="inline-flex items-center rounded-full bg-[var(--color-surface-muted)] px-3 py-1 text-sm font-medium text-[var(--color-page-text)] ring-1 ring-[var(--color-card-border)]">Verified department selection</span>
                <span className="inline-flex items-center rounded-full bg-[var(--color-surface-muted)] px-3 py-1 text-sm font-medium text-[var(--color-page-text)] ring-1 ring-[var(--color-card-border)]">Guardian contact required</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-text-soft)]">Sections</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--color-heading)]">4</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">Clear grouped details</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-text-soft)]">Estimated time</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--color-heading)]">3 min</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">For a complete submission</p>
              </div>
            </div>
          </div>
        </div>

        <Alert type="success" message={success} />
        <Alert type="error" message={error} />

        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-8 xl:self-start">
            <div className="overflow-hidden rounded-[1.35rem] border border-slate-200 bg-[--color-bg-card] dark:bg-slate-800 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.24)] sm:rounded-[1.5rem]">
              <div className="border-b border-slate-100 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Form outline</p>
                <h4 className="ui-heading-tight mt-2 text-xl font-semibold text-slate-950">Sections included</h4>
              </div>
              <div className="grid gap-2 px-3 py-3 sm:px-4 sm:py-4 xl:block xl:space-y-1">
                {sectionMeta.map((section) => {
                  const Icon = section.icon
                  return (
                    <div key={section.id} className="flex items-start gap-3 rounded-2xl border border-slate-100 px-3 py-3 xl:border-transparent">
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${section.iconClassName}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-soft)]">{section.step}</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--color-heading)]">{section.title}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)] xl:block">{section.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="border-t border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-5 py-4 text-sm leading-6 text-[var(--color-text-muted)]">
                Use your personal email address and review all required fields before submitting.
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            <section className="overflow-hidden rounded-[1.35rem] border border-slate-200 bg-[--color-bg-card] dark:bg-slate-800 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.24)] sm:rounded-[1.5rem]">
              <div className="border-b border-slate-100 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <ClipboardPenLine className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Application form</p>
                    <h4 className="ui-heading-tight mt-1 text-xl font-semibold text-slate-950">Student intake details</h4>
                  </div>
                </div>
              </div>

              <div className="space-y-5 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6 lg:px-7">
                <section className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4 sm:rounded-[1.25rem] sm:p-5">
                  {renderSectionHeader(sectionMeta[0])}
                  <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                    {applicantFields.map(renderInputField)}
                  </div>
                </section>

                <section className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4 sm:rounded-[1.25rem] sm:p-5">
                  {renderSectionHeader(sectionMeta[1])}
                  <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                    {guardianFields.map(renderInputField)}
                    <div className="lg:col-span-2">
                      {renderTextareaField({ name: 'localGuardianAddress', label: 'Local Guardian Address', placeholder: 'Enter local guardian address' })}
                    </div>
                  </div>
                </section>

                <section className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4 sm:rounded-[1.25rem] sm:p-5">
                  {renderSectionHeader(sectionMeta[2])}
                  <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div>
                      <label className="ui-form-label text-slate-700">Department</label>
                      <div className="relative">
                        <BookOpenCheck className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <select
                          name="preferredDepartment"
                          value={values.preferredDepartment}
                          onChange={handleChange}
                          disabled={loadingDepartments}
                          className={`ui-form-input border-slate-200 bg-[--color-bg-card] dark:bg-slate-800 pl-11 shadow-[0_1px_2px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.9)] ${errors.preferredDepartment ? 'ui-form-input-error' : ''}`}
                        >
                          <option value="">{loadingDepartments ? 'Loading departments...' : 'Select department'}</option>
                          {departments.map((department) => (
                            <option key={department.id} value={department.name}>
                              {department.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {errors.preferredDepartment ? <p className="ui-form-helper-error">{errors.preferredDepartment}</p> : null}
                    </div>
                    <div>
                      <label className="ui-form-label text-slate-700">Blood Group</label>
                      <div className="relative">
                        <HeartPulse className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-accent-400" />
                        <input
                          name="bloodGroup"
                          value={values.bloodGroup}
                          onChange={handleChange}
                          placeholder="Optional blood group"
                          className="ui-form-input border-slate-200 bg-[--color-bg-card] dark:bg-slate-800 pl-11 shadow-[0_1px_2px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.9)]"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4 sm:rounded-[1.25rem] sm:p-5">
                  {renderSectionHeader(sectionMeta[3])}
                  <div className="mt-5 grid grid-cols-1 gap-5">
                    {renderTextareaField({ name: 'permanentAddress', label: 'Permanent Address', placeholder: 'Enter permanent address' })}
                    {renderTextareaField({ name: 'temporaryAddress', label: 'Temporary Address', placeholder: 'Enter temporary address' })}
                  </div>
                </section>

                <div className="rounded-[1.25rem] border border-slate-300 bg-slate-900 px-5 py-5 text-white shadow-[0_18px_45px_-36px_rgba(15,23,42,0.58)] sm:rounded-[1.5rem] sm:px-6 sm:py-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">Final step</p>
                      <h4 className="ui-heading-tight mt-2 text-xl font-semibold sm:text-2xl">Submit the completed intake form</h4>
                      <p className="mt-3 text-sm leading-7 text-slate-300">
                        Once submitted, the admissions team can review these details and continue account preparation.
                      </p>
                    </div>
                    <div className="w-full lg:w-[290px]">
                      <button type="submit" disabled={loading || loadingDepartments || departments.length === 0} className="ui-auth-primary-button border border-white/10 bg-[linear-gradient(135deg,#f59e0b,#f97316)] shadow-[0_18px_36px_-24px_rgba(249,115,22,0.8)] hover:shadow-[0_22px_42px_-24px_rgba(245,158,11,0.85)]">
                        {loading ? <span className="ui-auth-spinner" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" />}
                        <span>{loading ? 'Submitting...' : loadingDepartments ? 'Loading form...' : 'Submit intake form'}</span>
                      </button>
                      <p className="mt-3 text-center text-xs text-slate-400">Please verify all required fields before submission.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </form>
      </div>
      <ConfirmDialog
        open={dialogOpen}
        title="Leave this form?"
        message="You have unsaved intake details. Leaving now will discard them."
        confirmText="Leave Page"
        cancelText="Stay Here"
        tone="info"
        onConfirm={leavePage}
        onClose={stayOnPage}
      />
    </AuthSplitLayout>
  )
}

export default StudentIntakeForm
