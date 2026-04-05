import { useEffect, useState } from 'react'
import { Modal, StyleSheet, Text, View } from 'react-native'
import AppButton from '../../../components/common/AppButton'
import AppCard from '../../../components/common/AppCard'
import AppInput from '../../../components/common/AppInput'
import EmptyState from '../../../components/common/EmptyState'
import ErrorMessage from '../../../components/common/ErrorMessage'
import LoadingSpinner from '../../../components/common/LoadingSpinner'
import PageHeader from '../../../components/common/PageHeader'
import Screen from '../../../components/common/Screen'
import StatusBadge from '../../../components/common/StatusBadge'
import api from '../../../utils/api'
import { getFriendlyErrorMessage } from '../../../utils/errors'
import { useTheme } from '../../../context/ThemeContext'
import colors from '../../../constants/colors'
import { spacing } from '../../../constants/layout'

const StudentTicketsScreen = () => {
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]
  const [tickets, setTickets] = useState([])
  const [absencesWithoutTicket, setAbsencesWithoutTicket] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalVisible, setModalVisible] = useState(false)
  const [selectedAttendance, setSelectedAttendance] = useState(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await api.get('/attendance/tickets/my')
      setTickets(Array.isArray(response.data?.tickets) ? response.data.tickets : [])
      setAbsencesWithoutTicket(Array.isArray(response.data?.absencesWithoutTicket) ? response.data.absencesWithoutTicket : [])
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load tickets right now.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const openCreateModal = (attendance) => {
    setSelectedAttendance(attendance)
    setReason('')
    setModalVisible(true)
  }

  const submitTicket = async () => {
    if (!selectedAttendance?.id || !reason.trim()) {
      setError('Please provide the reason for the absence ticket.')
      return
    }

    try {
      setSubmitting(true)
      setError('')
      await api.post('/attendance/tickets', {
        attendanceId: selectedAttendance.id,
        reason: reason.trim()
      })
      setModalVisible(false)
      setSelectedAttendance(null)
      setReason('')
      await loadData()
    } catch (submitError) {
      setError(getFriendlyErrorMessage(submitError, 'Unable to create the absence ticket right now.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Screen>
        <PageHeader
          eyebrow="Tickets"
          title="Absence tickets"
          subtitle="Create absence tickets for missed classes and track their review status."
        />
        <ErrorMessage message={error} />

        {loading ? <LoadingSpinner /> : null}

        {!loading && absencesWithoutTicket.length > 0 ? (
          <AppCard style={styles.block}>
            <Text style={[styles.blockTitle, { color: palette.text }]}>Create new ticket</Text>
            {absencesWithoutTicket.map((attendance) => (
              <View key={attendance.id} style={[styles.ticketRow, { borderColor: palette.border }]}>
                <View style={styles.ticketCopy}>
                  <Text style={[styles.title, { color: palette.text }]}>{attendance.subject?.name || 'Subject'}</Text>
                  <Text style={[styles.meta, { color: palette.textMuted }]}>
                    {attendance.date ? new Date(attendance.date).toLocaleDateString() : 'Date unavailable'}
                  </Text>
                </View>
                <AppButton title="Create" onPress={() => openCreateModal(attendance)} />
              </View>
            ))}
          </AppCard>
        ) : null}

        {!loading && tickets.length === 0 && absencesWithoutTicket.length === 0 ? (
          <AppCard>
            <EmptyState title="No tickets yet" description="Your submitted or pending absence tickets will appear here." />
          </AppCard>
        ) : null}

        {tickets.map((ticket) => (
          <AppCard key={ticket.id} style={styles.block}>
            <View style={styles.rowBetween}>
              <View style={styles.ticketCopy}>
                <Text style={[styles.title, { color: palette.text }]}>{ticket.attendance?.subject?.name || 'Absence ticket'}</Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  {ticket.attendance?.date ? new Date(ticket.attendance.date).toLocaleDateString() : 'Date unavailable'}
                </Text>
              </View>
              <StatusBadge label={ticket.status || 'PENDING'} tone={ticket.status === 'APPROVED' ? 'success' : ticket.status === 'REJECTED' ? 'danger' : 'warning'} />
            </View>
            <Text style={[styles.meta, { color: palette.textMuted }]}>Reason: {ticket.reason || 'No reason provided'}</Text>
            {ticket.response ? (
              <Text style={[styles.meta, { color: palette.textMuted }]}>Response: {ticket.response}</Text>
            ) : null}
          </AppCard>
        ))}
      </Screen>

      <Modal transparent visible={modalVisible} animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.backdrop, { backgroundColor: palette.overlay }]}>
          <AppCard style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>Create absence ticket</Text>
            <Text style={[styles.meta, { color: palette.textMuted }]}>
              {selectedAttendance?.subject?.name || 'Absent class'}
            </Text>
            <AppInput
              label="Reason"
              value={reason}
              onChangeText={setReason}
              placeholder="Explain why you were absent"
            />
            <View style={styles.actions}>
              <AppButton title="Cancel" variant="secondary" onPress={() => setModalVisible(false)} style={styles.action} />
              <AppButton title="Submit" onPress={submitTicket} loading={submitting} style={styles.action} />
            </View>
          </AppCard>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  block: {
    gap: 12
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: '800'
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12
  },
  ticketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 12
  },
  ticketCopy: {
    flex: 1,
    gap: 4
  },
  title: {
    fontSize: 15,
    fontWeight: '800'
  },
  meta: {
    fontSize: 13,
    lineHeight: 19
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg
  },
  modalCard: {
    gap: 14
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800'
  },
  actions: {
    flexDirection: 'row',
    gap: 10
  },
  action: {
    flex: 1
  }
})

export default StudentTicketsScreen
