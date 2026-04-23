import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-bold text-primary">Page not found</Text>

        <Link className="mt-4 text-base text-accent" href="/(auth)/login">
          Go to login
        </Link>
      </View>
    </>
  );
}
