import { useColorScheme } from "react-native";
import { Colors } from "../theme/colors";
import { useAppStore } from "../store/useAppStore";

export function useTheme() {
  const systemScheme = useColorScheme();
  const { theme } = useAppStore();

  const resolvedScheme = theme === "device" ? (systemScheme ?? "light") : theme;
  const colors = Colors[resolvedScheme];

  return { colors, scheme: resolvedScheme, isDark: resolvedScheme === "dark" };
}
