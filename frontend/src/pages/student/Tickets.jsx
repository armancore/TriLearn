import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import StudentLayout from '../../layouts/StudentLayout'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Alert from '../../components/Alert'
import { useToast } from '../../components/Toast'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'

const StudentTickets = () => {
  const [tickets, setTickets] = useState([])
  const [absencesWithoutTicket, setAbsencesWithoutTicket] = useState([])
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submittingId, setSubmittingId] = useState('')
  const { showToast } = useToast()

  const loadTickets = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await api.get('/attendance/tickets/my')
      setTickets(res.data.tickets || [])
      setAbsencesWithoutTicket(res.data.absencesWithoutTicket || [])
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to load absence tickets right now.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTickets()
  }, [])

  const submitTicket = async (attendanceId) => {
    const reason = String(drafts[attendanceId] || '').trim()
    if (reason.length < 10) {
      setError('Please provide a short but clear reason before submitting the ticket.')
      return
    }

    try {
      setSubmittingId(attendanceId)
      setError('')
      await api.post('/attendance/tickets', { attendanceId, reason })
      setDrafts((current) => ({ ...current, [attendanceId]: '' }))
      showToast({ title: 'Absence ticket submitted successfully.' })
      await loadTickets()
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to submit the absence ticket right now.'))
    } finally {
      setSubmittingId('')
    }
  }

  return (
    <StudentLayout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Absence Tickets"
          subtitle="Review absent records and submit your explanation where needed."
          breadcrumbs={['Student', 'Tickets']}
        />

        <Alert type="error" message={error} />

        {loading ? (
          <LoadingSkeleton rows={5} itemClassName="h-28" />
        ) : (
          <div className="space-y-8">
            <section className="ui-card rounded-2xl p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Need Your Response</h2>
                  <p className="text-sm text-slate-500">These absences were auto-recorded after the scan window closed.</p>
                </div>
                <span className="ui-status-badge ui-status-warning">{absencesWithoutTicket.length} pending</span>
              </div>

              {absencesWithoutTicket.length === 0 ? (
                <EmptyState
                  icon="📝"
                  title="No pending absence tickets"
                  description="You do not have any absent records waiting for an explanation right now."
                />
              ) : (
                <div className="space-y-4">
                  {absencesWithoutTicket.map((absence) => (
                    <div key={absence.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{absence.subject?.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{absence.subject?.code} • {new Date(absence.date).toLocaleDateString()}</p>
                        </div>
                        <span className="ui-status-badge ui-status-danger">Absent</span>
                      </div>
                      <textarea
                        rows={3}
                        value={drafts[absence.id] || ''}
                        onChange={(event) => setDrafts((current) => ({ ...current, [absence.id]: event.target.value }))}
                        placeholder="Explain why you missed this class..."
                        className="ui-form-input mt-4"
                      />
                      <button
                        type="button"
                        onClick={() => submitTicket(absence.id)}
                        disabled={submittingId === absence.id}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--color-role-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                        <span>{submittingId === absence.id ? 'Submitting...' : 'Submit Ticket'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="ui-card rounded-2xl p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Submitted Tickets</h2>
                  <p className="text-sm text-slate-500">Track the review status of your previous absence explanations.</p>
                </div>
                <span className="ui-status-badge ui-status-neutral">{tickets.length} records</span>
              </div>

              {tickets.length === 0 ? (
                <EmptyState
                  icon="📭"
                  title="No submitted tickets yet"
                  description="Submitted absence explanations will appear here once you send one."
                />
              ) : (
                <div className="space-y-4">
                  {tickets.map((ticket) => (
                    <div key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{ticket.attendance?.subject?.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {ticket.attendance?.subject?.code} • {new Date(ticket.attendance?.date).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`ui-status-badge ${
                          ticket.status === 'APPROVED'
                            ? 'ui-status-success'
                            : ticket.status === 'REJECTED'
                              ? 'ui-status-danger'
                              : 'ui-status-warning'
                        }`}
                        >
                          {ticket.status}
                        </span>
                      </div>
                      <p className="mt-4 text-sm text-slate-600">{ticket.reason}</p>
                      {ticket.response ? (
                        <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                          <span className="font-medium text-slate-800">Review note:</span> {ticket.response}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </StudentLayout>
  )
}

export default StudentTickets
