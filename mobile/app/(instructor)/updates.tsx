import { Text, View } from 'react-native';

export default function InstructorUpdatesScreen() {
  return (
    <View className="flex-1 p-6">
      <View className="rounded-2xl bg-white p-5">
        <Text className="text-xl font-bold text-primary">Updates</Text>
        <Text className="mt-2 text-slate-700">Instructor updates will be added in the next step.</Text>
      </View>
    </View>
  );
}
