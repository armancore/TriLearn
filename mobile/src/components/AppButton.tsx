import { Pressable, Text, type PressableProps } from 'react-native';

interface AppButtonProps extends PressableProps {
  label: string;
  loading?: boolean;
}

export const AppButton = ({ label, loading = false, disabled, ...props }: AppButtonProps) => (
  <Pressable
    className="h-12 items-center justify-center rounded-xl bg-primary"
    disabled={disabled || loading}
    {...props}
  >
    <Text className="text-base font-semibold text-white">{loading ? 'Please wait...' : label}</Text>
  </Pressable>
);
