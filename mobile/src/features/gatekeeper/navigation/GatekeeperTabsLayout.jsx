import { House, LifeBuoy, ScanFace, UserCircle2 } from 'lucide-react-native'
import createTabsLayout from '../../../navigation/createTabsLayout'

const GatekeeperTabsLayout = createTabsLayout([
  { name: 'index', title: 'Home', icon: House },
  { name: 'scanner', title: 'Scanner', icon: ScanFace },
  { name: 'services', title: 'Services', icon: LifeBuoy },
  { name: 'profile', title: 'Profile', icon: UserCircle2 }
])

export default GatekeeperTabsLayout
