import StudentLayout from '../../layouts/StudentLayout'
import RoutineView from '../../components/RoutineView'
import useRoutines from '../../hooks/useRoutines'

const StudentRoutine = () => {
  const { routines, loading, error } = useRoutines({ roleLabel: 'student' })

  return <RoutineView Layout={StudentLayout} breadcrumbs={['Student', 'Routine']} loading={loading} error={error} routines={routines} />
}

export default StudentRoutine


