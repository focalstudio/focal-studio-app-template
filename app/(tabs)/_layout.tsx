import { Tabs } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { FontSize } from "@/theme";

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: FontSize.xs },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            // Replace with an icon library such as @expo/vector-icons
            // e.g. <Ionicons name="home" size={24} color={color} />
            // For now using a text placeholder:
            <></>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: () => <></>,
        }}
      />
    </Tabs>
  );
}
