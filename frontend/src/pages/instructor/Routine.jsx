import InstructorLayout from '../../layouts/InstructorLayout'
import RoutineView from '../../components/RoutineView'
import useRoutines from '../../hooks/useRoutines'

const InstructorRoutine = () => {
  const { routines, loading, error } = useRoutines({ roleLabel: 'instructor' })

  return <RoutineView Layout={InstructorLayout} breadcrumbs={['Instructor', 'Routine']} loading={loading} error={error} routines={routines} />
}

export default InstructorRoutine


