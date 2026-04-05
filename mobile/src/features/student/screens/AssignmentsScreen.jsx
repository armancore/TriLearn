import { useEffect, useMemo, useState } from 'react'
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
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

const toAssignmentList = (responseData) => (
  Array.isArray(responseData?.assignments)
    ? responseData.assignments
    : Array.isArray(responseData)
      ? responseData
      : []
)

const toSubmissionList = (responseData) => (
  Array.isArray(responseData?.submissions)
    ? responseData.submissions
    : Array.isArray(responseData)
      ? responseData
      : []
)

const StudentAssignmentsScreen = () => {
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]
  const [assignments, setAssignments] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalVisible, setModalVisible] = useState(false)
  const [selectedAssignment, setSelectedAssignment] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [submissionNote, setSubmissionNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submissionMap = useMemo(() => {
    const map = new Map()
    submissions.forEach((item) => {
      map.set(item.assignmentId, item)
    })
    return map
  }, [submissions])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      const [assignmentsResponse, submissionsResponse] = await Promise.all([
        api.get('/assignments'),
        api.get('/assignments/my-submissions')
      ])
      setAssignments(toAssignmentList(assignmentsResponse.data))
      setSubmissions(toSubmissionList(submissionsResponse.data))
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load assignments right now.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const openSubmitModal = (assignment) => {
    setSelectedAssignment(assignment)
    setSelectedFile(null)
    setSubmissionNote('')
    setModalVisible(true)
  }

  const pickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        type: ['application/pdf']
      })

      if (result.canceled || !result.assets?.length) {
        return
      }

      setSelectedFile(result.assets[0])
    } catch (pickError) {
      setError(getFriendlyErrorMessage(pickError, 'Unable to pick the PDF file.'))
    }
  }

  const submitAssignment = async () => {
    if (!selectedAssignment) {
      return
    }

    if (!selectedFile) {
      setError('Please choose your answer PDF first.')
      return
    }

    try {
      setSubmitting(true)
      setError('')

      const formData = new FormData()
      formData.append('note', submissionNote)
      formData.append('answerPdf', {
        uri: selectedFile.uri,
        name: selectedFile.name || 'submission.pdf',
        type: selectedFile.mimeType || 'application/pdf'
      })

      await api.post(`/assignments/${selectedAssignment.id}/submit`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      setModalVisible(false)
      setSelectedAssignment(null)
      setSelectedFile(null)
      setSubmissionNote('')
      await loadData()
    } catch (submitError) {
      setError(getFriendlyErrorMessage(submitError, 'Unable to submit the assignment right now.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Screen>
        <PageHeader
          eyebrow="Assignments"
          title="Assignments and submissions"
          subtitle="View your assignments, upload submissions, and track submission status."
        />
        <ErrorMessage message={error} />

        {loading ? <LoadingSpinner /> : null}

        {!loading && assignments.length === 0 ? (
          <AppCard>
            <EmptyState title="No assignments yet" description="Assignments will appear here once instructors publish them." />
          </AppCard>
        ) : null}

        {assignments.map((assignment) => {
          const submission = submissionMap.get(assignment.id)
          const dueDate = assignment.dueDate ? new Date(assignment.dueDate).toLocaleString() : 'Due date unavailable'

          return (
            <AppCard key={assignment.id} style={styles.assignmentCard}>
              <View style={styles.rowBetween}>
                <View style={styles.copy}>
                  <Text style={[styles.title, { color: palette.text }]}>{assignment.title || 'Assignment'}</Text>
                  <Text style={[styles.meta, { color: palette.textMuted }]}>{assignment.subject?.name || 'Subject unavailable'}</Text>
                  <Text style={[styles.meta, { color: palette.textMuted }]}>Due: {dueDate}</Text>
                </View>
                <StatusBadge label={submission?.status || 'PENDING'} tone={submission ? 'success' : 'default'} />
              </View>

              {assignment.description ? (
                <Text style={[styles.description, { color: palette.textMuted }]}>{assignment.description}</Text>
              ) : null}

              {submission ? (
                <View style={[styles.submissionBox, { backgroundColor: palette.surfaceMuted }]}>
                  <Text style={[styles.submissionHeading, { color: palette.text }]}>Your submission</Text>
                  <Text style={[styles.meta, { color: palette.textMuted }]}>
                    Submitted: {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : 'Not available'}
                  </Text>
                  {submission.feedback ? (
                    <Text style={[styles.meta, { color: palette.textMuted }]}>Feedback: {submission.feedback}</Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.actions}>
                {assignment.questionPdfUrl ? (
                  <AppButton
                    title="View Question"
                    variant="secondary"
                    onPress={() => Linking.openURL(assignment.questionPdfUrl).catch(() => null)}
                    style={styles.action}
                  />
                ) : null}
                {!submission ? (
                  <AppButton title="Submit" onPress={() => openSubmitModal(assignment)} style={styles.action} />
                ) : null}
              </View>
            </AppCard>
          )
        })}
      </Screen>

      <Modal transparent visible={modalVisible} animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.backdrop, { backgroundColor: palette.overlay }]}>
          <AppCard style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>Submit assignment</Text>
            <Text style={[styles.meta, { color: palette.textMuted }]}>
              {selectedAssignment?.title || 'Assignment'}
            </Text>
            <AppButton title={selectedFile ? 'Change PDF' : 'Choose PDF'} variant="secondary" onPress={pickPdf} />
            {selectedFile ? (
              <Text style={[styles.meta, { color: palette.textMuted }]}>Selected: {selectedFile.name}</Text>
            ) : null}
            <AppInput
              label="Note"
              value={submissionNote}
              onChangeText={setSubmissionNote}
              placeholder="Optional note for your submission"
            />
            <View style={styles.actions}>
              <AppButton title="Cancel" variant="secondary" onPress={() => setModalVisible(false)} style={styles.action} />
              <AppButton title="Submit" onPress={submitAssignment} loading={submitting} style={styles.action} />
            </View>
          </AppCard>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  assignmentCard: {
    gap: 12
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12
  },
  copy: {
    flex: 1,
    gap: 4
  },
  title: {
    fontSize: 17,
    fontWeight: '800'
  },
  meta: {
    fontSize: 13,
    lineHeight: 19
  },
  description: {
    fontSize: 14,
    lineHeight: 20
  },
  submissionBox: {
    borderRadius: 16,
    padding: 14,
    gap: 4
  },
  submissionHeading: {
    fontSize: 14,
    fontWeight: '800'
  },
  actions: {
    flexDirection: 'row',
    gap: 10
  },
  action: {
    flex: 1
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
  }
})

export default StudentAssignmentsScreen
