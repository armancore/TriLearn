import { Bell, BookOpen, CalendarDays, ClipboardCheck, FileStack, GraduationCap, House, IdCard, LifeBuoy, Ticket, UserCircle2 } from 'lucide-react-native'
import createTabsLayout from '../../../navigation/createTabsLayout'

const StudentTabsLayout = createTabsLayout([
  { name: 'index', title: 'Home', icon: House },
  { name: 'learning', title: 'Learning', icon: GraduationCap },
  { name: 'services', title: 'Services', icon: LifeBuoy },
  { name: 'profile', title: 'Profile', icon: UserCircle2 },
  { name: 'attendance', title: 'Attendance', icon: ClipboardCheck, href: null },
  { name: 'marks', title: 'Marks', icon: GraduationCap, href: null },
  { name: 'notices', title: 'Notices', icon: Bell, href: null },
  { name: 'routine', title: 'Routine', icon: CalendarDays, href: null },
  { name: 'assignments', title: 'Assignments', icon: FileStack, href: null },
  { name: 'materials', title: 'Materials', icon: BookOpen, href: null },
  { name: 'subjects', title: 'Subjects', icon: BookOpen, href: null },
  { name: 'tickets', title: 'Tickets', icon: Ticket, href: null },
  { name: 'id-card', title: 'ID Card', icon: IdCard, href: null }
])

export default StudentTabsLayout
