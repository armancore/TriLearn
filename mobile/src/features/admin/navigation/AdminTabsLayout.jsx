import { Bell, Building2, CalendarDays, House, Layers3, LifeBuoy, ShieldCheck, UserCircle2, Users } from 'lucide-react-native'
import createTabsLayout from '../../../navigation/createTabsLayout'

const AdminTabsLayout = createTabsLayout([
  { name: 'index', title: 'Home', icon: House },
  { name: 'management', title: 'Management', icon: ShieldCheck },
  { name: 'services', title: 'Services', icon: LifeBuoy },
  { name: 'profile', title: 'Profile', icon: UserCircle2 },
  { name: 'users', title: 'Users', icon: Users, href: null },
  { name: 'departments', title: 'Departments', icon: Building2, href: null },
  { name: 'subjects', title: 'Subjects', icon: Layers3, href: null },
  { name: 'notices', title: 'Notices', icon: Bell, href: null },
  { name: 'routine', title: 'Routine', icon: CalendarDays, href: null }
])

export default AdminTabsLayout
