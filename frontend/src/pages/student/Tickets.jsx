import { useEffect, useState } from 'react'
import { ClipboardList, Inbox, Send } from 'lucide-react'
import StudentLayout from '../../layouts/StudentLayout'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Alert from '../../components/Alert'
import { useToast } from '../../components/Toast'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'
import { isRequestCanceled } from '../../utils/http'

const StudentTickets = () => {
  const [tickets, setTickets] = useState([])
  const [absencesWithoutTicket, setAbsencesWithoutTicket] = useState([])
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submittingId, setSubmittingId] = useState('')
  const { showToast } = useToast()

  const loadTickets = async (signal) => {
    try {
      setLoading(true)
      setError('')
      const res = await api.get('/attendance/tickets/my', { signal })
      setTickets(res.data.tickets || [])
      setAbsencesWithoutTicket(res.data.absencesWithoutTicket || [])
    } catch (requestError) {
      if (isRequestCanceled(requestError)) return
      setError(getFriendlyErrorMessage(requestError, 'Unable to load absence tickets right now.'))
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void loadTickets(controller.signal)
    return () => controller.abort()
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
      <div className="student-page p-4 md:p-8">
        <PageHeader
          title="Requests"
          subtitle="Submit absence requests and track instructor or coordinator responses from one place."
          breadcrumbs={['Student', 'Requests']}
        />

        <Alert type="error" message={error} />

        {loading ? (
          <LoadingSkeleton rows={5} itemClassName="h-28" />
        ) : (
          <div className="space-y-8">
            <section className="ui-card rounded-2xl p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">Need Your Response</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">These absences were auto-recorded after the scan window closed.</p>
                </div>
                <span className="ui-status-badge ui-status-warning">{absencesWithoutTicket.length} pending</span>
              </div>

              {absencesWithoutTicket.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No pending absence tickets"
                  description="You do not have any absent records waiting for an explanation right now."
                />
              ) : (
                <div className="space-y-4">
                  {absencesWithoutTicket.map((absence) => (
                    <div key={absence.id} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="font-semibold text-[var(--color-heading)]">{absence.subject?.name}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{absence.subject?.code} • {new Date(absence.date).toLocaleDateString()}</p>
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
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">Submitted Requests</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">Track the review status and response for each submitted request.</p>
                </div>
                <span className="ui-status-badge ui-status-neutral">{tickets.length} records</span>
              </div>

              {tickets.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No submitted tickets yet"
                  description="Submitted absence explanations will appear here once you send one."
                />
              ) : (
                <div className="space-y-4">
                  {tickets.map((ticket) => (
                    <div key={ticket.id} className="rounded-2xl border border-[var(--color-card-border)] bg-[--color-bg-card] p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="font-semibold text-[var(--color-heading)]">{ticket.attendance?.subject?.name}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
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
                      <p className="mt-4 text-sm text-[var(--color-text-muted)]">{ticket.reason}</p>
                      {ticket.response ? (
                        <div className="mt-3 rounded-xl bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
                          <span className="font-medium text-[var(--color-heading)]">Review note:</span> {ticket.response}
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
