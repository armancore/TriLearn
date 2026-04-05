import { Bell, BookOpen, CalendarDays, ClipboardCheck, FileStack, GraduationCap, House, LifeBuoy, MessageSquare, UserCircle2 } from 'lucide-react-native'
import createTabsLayout from '../../../navigation/createTabsLayout'

const InstructorTabsLayout = createTabsLayout([
  { name: 'index', title: 'Home', icon: House },
  { name: 'teaching', title: 'Teaching', icon: GraduationCap },
  { name: 'services', title: 'Services', icon: LifeBuoy },
  { name: 'profile', title: 'Profile', icon: UserCircle2 },
  { name: 'attendance', title: 'Attendance', icon: ClipboardCheck, href: null },
  { name: 'marks', title: 'Marks', icon: GraduationCap, href: null },
  { name: 'assignments', title: 'Tasks', icon: FileStack, href: null },
  { name: 'notices', title: 'Notices', icon: Bell, href: null },
  { name: 'materials', title: 'Materials', icon: BookOpen, href: null },
  { name: 'routine', title: 'Routine', icon: CalendarDays, href: null },
  { name: 'subjects', title: 'Subjects', icon: BookOpen, href: null },
  { name: 'requests', title: 'Requests', icon: MessageSquare, href: null }
])

export default InstructorTabsLayout
