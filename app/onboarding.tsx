import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  FlatList,
  type ViewToken,
} from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/hooks/useTheme";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { FontSize, FontWeight, Spacing, Radius } from "@/theme";
import { Analytics } from "@/services/analytics";
import { APP_NAME } from "@/constants";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    id: "1",
    title: `Welcome to ${APP_NAME}`,
    subtitle: "Replace this with a compelling description of what your app does.",
    emoji: "👋",
  },
  {
    id: "2",
    title: "Your Key Feature",
    subtitle: "Describe the main benefit or feature that makes your app unique.",
    emoji: "✨",
  },
  {
    id: "3",
    title: "Start Today",
    subtitle: "Replace this slide with your call to action or a key outcome.",
    emoji: "🚀",
  },
];

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { complete } = useOnboardingStore();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]) setActiveIndex(viewableItems[0].index ?? 0);
    }
  ).current;

  function handleNext() {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      handleComplete();
    }
  }

  function handleComplete() {
    complete();
    Analytics.onboardingCompleted();
    router.replace("/(auth)/login");
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Pressable style={styles.skipRow} onPress={handleComplete}>
        <Text style={[styles.skip, { color: colors.textSecondary }]}>Skip</Text>
      </Pressable>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {item.subtitle}
            </Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    i === activeIndex ? colors.accent : colors.border,
                  width: i === activeIndex ? 20 : 8,
                },
              ]}
            />
          ))}
        </View>

        <Button
          label={activeIndex === SLIDES.length - 1 ? "Get Started" : "Next"}
          onPress={handleNext}
          style={styles.cta}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skipRow: { alignItems: "flex-end", paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  skip: { fontSize: FontSize.md },
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xxxl,
    gap: Spacing.lg,
  },
  emoji: { fontSize: 72 },
  title: { fontSize: FontSize.xxxl, fontWeight: FontWeight.bold, textAlign: "center" },
  subtitle: { fontSize: FontSize.lg, textAlign: "center", lineHeight: FontSize.lg * 1.5 },
  footer: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.lg },
  dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: Spacing.xs },
  dot: { height: 8, borderRadius: Radius.full },
  cta: { borderRadius: Radius.xl },
});
