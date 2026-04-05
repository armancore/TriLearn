import { Tabs } from 'expo-router'
import { useTheme } from '../context/ThemeContext'
import colors from '../constants/colors'

const createTabsLayout = (screens) => {
  const TabsLayout = () => {
    const { resolvedTheme } = useTheme()
    const palette = colors[resolvedTheme]

    return (
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: palette.primary,
          tabBarInactiveTintColor: palette.tabIcon,
          tabBarStyle: {
            backgroundColor: palette.surface,
            borderTopColor: palette.border,
            borderTopWidth: 1,
            height: 72,
            paddingTop: 8,
            paddingBottom: 10
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '700'
          }
        }}
      >
        {screens.map((screen) => {
          const Icon = screen.icon

          return (
            <Tabs.Screen
              key={screen.name}
              name={screen.name}
              options={{
                title: screen.title,
                href: screen.href ?? undefined,
                tabBarIcon: ({ color, size }) => <Icon color={color} size={size} />
              }}
            />
          )
        })}
      </Tabs>
    )
  }

  return TabsLayout
}

export default createTabsLayout
