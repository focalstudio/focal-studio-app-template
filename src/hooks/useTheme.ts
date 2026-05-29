import { useColorScheme } from "react-native";
import { Colors } from "../theme/colors";
import { useAppStore } from "../store/useAppStore";

export function useTheme() {
  const systemScheme = useColorScheme();
  const { theme } = useAppStore();

  const effectiveSystem = systemScheme === "light" || systemScheme === "dark" ? systemScheme : "light";
  const resolvedScheme = theme === "device" ? effectiveSystem : theme;
  const colors = Colors[resolvedScheme];

  return { colors, scheme: resolvedScheme, isDark: resolvedScheme === "dark" };
}
