import { Text, View } from 'react-native';

export default function StudentAttendanceScreen() {
  return (
    <View className="flex-1 p-6">
      <View className="rounded-2xl bg-white p-5">
        <Text className="text-xl font-bold text-primary">Attendance</Text>
        <Text className="mt-2 text-slate-700">Track lecture attendance percentages and missed sessions here.</Text>
      </View>
    </View>
  );
}
