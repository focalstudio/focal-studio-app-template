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
      {/*
        `tabBarButtonTestID` is an E2E seam — see "The seams the flows depend on"
        in docs/testing.md. `tab-home` is how .maestro/*.yaml recognises "we are
        signed in and inside the app"; it used to assert on the home card's
        "Welcome" copy, which is the first thing a real app deletes. Rename the
        tabs freely, keep the ids.
      */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarButtonTestID: "tab-home",
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
          tabBarButtonTestID: "tab-settings",
          tabBarIcon: () => <></>,
        }}
      />
    </Tabs>
  );
}
