import NotificationsScreen from '@/src/screens/NotificationsScreen';

export default function InstructorUpdatesScreen() {
  return (
    <NotificationsScreen
      emptyDescription="Submissions, marks and routine changes will appear here."
      emptyTitle="No updates"
      subtitle="Teaching activity and course alerts."
      title="Updates"
    />
  );
}
