import { Text, TextInput, View, type TextInputProps } from 'react-native';

interface AppInputProps extends TextInputProps {
  label: string;
  error?: string;
}

export const AppInput = ({ label, error, ...props }: AppInputProps) => (
  <View className="mb-4">
    <Text className="mb-2 text-sm font-medium text-primary">{label}</Text>
    <TextInput
      className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-800"
      placeholderTextColor="#9CA3AF"
      {...props}
    />
    {error ? <Text className="mt-1 text-xs text-red-700">{error}</Text> : null}
  </View>
);
