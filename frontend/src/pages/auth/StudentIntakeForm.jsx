import { useState } from 'react'
import { ArrowRight, BookOpenCheck, ClipboardPenLine, UserRoundCheck } from 'lucide-react'
import Alert from '../../components/Alert'
import AuthSplitLayout from '../../components/AuthSplitLayout'
import useForm from '../../hooks/useForm'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'

const StudentIntakeForm = () => {
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
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
  const { values, errors, handleChange, handleSubmit, setValues } = useForm({
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
  }, (formValues) => {
    const validationErrors = {}
    ;[
      'fullName',
      'email',
      'phone',
      'fatherName',
      'motherName',
      'fatherPhone',
      'motherPhone',
      'localGuardianName',
      'localGuardianAddress',
      'localGuardianPhone',
      'permanentAddress',
      'temporaryAddress',
      'dateOfBirth',
      'preferredDepartment'
    ].forEach((field) => {
      if (!String(formValues[field] || '').trim()) validationErrors[field] = 'This field is required'
    })
    return validationErrors
  })

  const onSubmit = async () => {
    try {
      setLoading(true)
      setError('')
      setSuccess('')
      await api.post('/auth/student-intake', values)
      setSuccess('Your student details have been submitted successfully. The institution can now review them and create your account.')
      setValues({
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
      })
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to submit your form right now.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthSplitLayout
      title="Welcome new students with a smoother intake flow."
      subtitle="This intake form gathers the details your institution needs before creating a student portal account inside EduNexus."
      formTitle="Student intake form"
      formSubtitle="Share this link with newly admitted first-semester students so they can submit their profile and guardian information in advance."
      features={features}
      contentWidthClassName="max-w-4xl"
    >
      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="ui-form-label">Full Name</label>
          <input name="fullName" value={values.fullName} onChange={handleChange} placeholder="Enter full name" className={`ui-form-input ${errors.fullName ? 'ui-form-input-error' : ''}`} />
          {errors.fullName ? <p className="ui-form-helper-error">{errors.fullName}</p> : null}
        </div>
        <div>
          <label className="ui-form-label">Personal Email</label>
          <input name="email" type="email" value={values.email} onChange={handleChange} placeholder="Enter personal email" className={`ui-form-input ${errors.email ? 'ui-form-input-error' : ''}`} />
          {errors.email ? <p className="ui-form-helper-error">{errors.email}</p> : null}
        </div>
        <div>
          <label className="ui-form-label">Phone Number</label>
          <input name="phone" value={values.phone} onChange={handleChange} placeholder="Enter phone number" className={`ui-form-input ${errors.phone ? 'ui-form-input-error' : ''}`} />
          {errors.phone ? <p className="ui-form-helper-error">{errors.phone}</p> : null}
        </div>
        <div>
          <label className="ui-form-label">Father Name</label>
          <input name="fatherName" value={values.fatherName} onChange={handleChange} placeholder="Enter father name" className={`ui-form-input ${errors.fatherName ? 'ui-form-input-error' : ''}`} />
          {errors.fatherName ? <p className="ui-form-helper-error">{errors.fatherName}</p> : null}
        </div>
        <div>
          <label className="ui-form-label">Mother Name</label>
          <input name="motherName" value={values.motherName} onChange={handleChange} placeholder="Enter mother name" className={`ui-form-input ${errors.motherName ? 'ui-form-input-error' : ''}`} />
          {errors.motherName ? <p className="ui-form-helper-error">{errors.motherName}</p> : null}
        </div>
        <div>
          <label className="ui-form-label">Father Contact Number</label>
          <input name="fatherPhone" value={values.fatherPhone} onChange={handleChange} placeholder="Enter father contact number" className={`ui-form-input ${errors.fatherPhone ? 'ui-form-input-error' : ''}`} />
          {errors.fatherPhone ? <p className="ui-form-helper-error">{errors.fatherPhone}</p> : null}
        </div>
        <div>
          <label className="ui-form-label">Mother Contact Number</label>
          <input name="motherPhone" value={values.motherPhone} onChange={handleChange} placeholder="Enter mother contact number" className={`ui-form-input ${errors.motherPhone ? 'ui-form-input-error' : ''}`} />
          {errors.motherPhone ? <p className="ui-form-helper-error">{errors.motherPhone}</p> : null}
        </div>
        <div>
          <label className="ui-form-label">Date of Birth</label>
          <input name="dateOfBirth" type="date" value={values.dateOfBirth} onChange={handleChange} className={`ui-form-input ${errors.dateOfBirth ? 'ui-form-input-error' : ''}`} />
          {errors.dateOfBirth ? <p className="ui-form-helper-error">{errors.dateOfBirth}</p> : null}
        </div>
        <div>
          <label className="ui-form-label">Department</label>
          <input name="preferredDepartment" value={values.preferredDepartment} onChange={handleChange} placeholder="Enter department" className={`ui-form-input ${errors.preferredDepartment ? 'ui-form-input-error' : ''}`} />
          {errors.preferredDepartment ? <p className="ui-form-helper-error">{errors.preferredDepartment}</p> : null}
        </div>
        <div>
          <label className="ui-form-label">Blood Group</label>
          <input name="bloodGroup" value={values.bloodGroup} onChange={handleChange} placeholder="Optional blood group" className="ui-form-input" />
        </div>
        <div>
          <label className="ui-form-label">Local Guardian Name</label>
          <input name="localGuardianName" value={values.localGuardianName} onChange={handleChange} placeholder="Enter local guardian name" className={`ui-form-input ${errors.localGuardianName ? 'ui-form-input-error' : ''}`} />
          {errors.localGuardianName ? <p className="ui-form-helper-error">{errors.localGuardianName}</p> : null}
        </div>
        <div>
          <label className="ui-form-label">Local Guardian Contact Number</label>
          <input name="localGuardianPhone" value={values.localGuardianPhone} onChange={handleChange} placeholder="Enter local guardian contact number" className={`ui-form-input ${errors.localGuardianPhone ? 'ui-form-input-error' : ''}`} />
          {errors.localGuardianPhone ? <p className="ui-form-helper-error">{errors.localGuardianPhone}</p> : null}
        </div>
        <div className="md:col-span-2">
          <label className="ui-form-label">Local Guardian Address</label>
          <textarea name="localGuardianAddress" value={values.localGuardianAddress} onChange={handleChange} placeholder="Enter local guardian address" rows={3} className={`ui-form-input ${errors.localGuardianAddress ? 'ui-form-input-error' : ''}`} />
          {errors.localGuardianAddress ? <p className="ui-form-helper-error">{errors.localGuardianAddress}</p> : null}
        </div>
        <div className="md:col-span-2">
          <label className="ui-form-label">Permanent Address</label>
          <textarea name="permanentAddress" value={values.permanentAddress} onChange={handleChange} placeholder="Enter permanent address" rows={3} className={`ui-form-input ${errors.permanentAddress ? 'ui-form-input-error' : ''}`} />
          {errors.permanentAddress ? <p className="ui-form-helper-error">{errors.permanentAddress}</p> : null}
        </div>
        <div className="md:col-span-2">
          <label className="ui-form-label">Temporary Address</label>
          <textarea name="temporaryAddress" value={values.temporaryAddress} onChange={handleChange} placeholder="Enter temporary address" rows={3} className={`ui-form-input ${errors.temporaryAddress ? 'ui-form-input-error' : ''}`} />
          {errors.temporaryAddress ? <p className="ui-form-helper-error">{errors.temporaryAddress}</p> : null}
        </div>
        <div className="md:col-span-2">
          <button type="submit" disabled={loading} className="ui-auth-primary-button">
            {loading ? <span className="ui-auth-spinner" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" />}
            <span>{loading ? 'Submitting...' : 'Submit student form'}</span>
          </button>
        </div>
      </form>
    </AuthSplitLayout>
  )
}

export default StudentIntakeForm
