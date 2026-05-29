import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useTheme } from "@/hooks/useTheme";
import { FontSize, FontWeight, Spacing, Radius } from "@/theme";
import { APP_NAME } from "@/constants";
import type { SubscriptionTier } from "@/types";

/*
 * To wire in RevenueCat: see src/store/usePaywallStore.ts for integration notes.
 * Replace the tier cards below with offerings fetched from Purchases.getOfferings().
 */

const FEATURES = [
  "Unlimited access to all features",
  "Priority support",
  "Cloud sync across devices",
  "Exclusive content and updates",
  "No ads",
];

type TierCard = {
  tier: SubscriptionTier;
  title: string;
  price: string;
  period: string;
  badge?: string;
};

const TIERS: TierCard[] = [
  { tier: "monthly", title: "Monthly", price: "$4.99", period: "/ month" },
  { tier: "annual", title: "Annual", price: "$29.99", period: "/ year", badge: "Best Value" },
  { tier: "lifetime", title: "Lifetime", price: "$79.99", period: "one-time" },
];

export default function PaywallScreen() {
  const { colors } = useTheme();
  function handleSubscribe(tier: SubscriptionTier) {
    // Wire RevenueCat before enabling this: see src/store/usePaywallStore.ts
    throw new Error(
      `[${APP_NAME}] Paywall not wired — integrate RevenueCat purchasePackage before shipping. Attempted tier: ${tier}`
    );
    // After wiring RevenueCat, replace the throw above with:
    // const purchase = await Purchases.purchasePackage(pkg);
    // const store = usePaywallStore.getState();
    // store.setSubscription(purchase.customerInfo.activeSubscriptions[0] as SubscriptionTier);
    // Analytics.subscriptionStarted(tier);
    // router.back();
  }

  function handleRestore() {
    // TODO: call RevenueCat Purchases.restorePurchases() here
    router.back();
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Pressable style={styles.closeRow} onPress={() => router.back()}>
        <Text style={[styles.close, { color: colors.textSecondary }]}>Close</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>
          Unlock {APP_NAME} Pro
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Start your 7-day free trial. Cancel anytime.
        </Text>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Text style={[styles.check, { color: colors.accent }]}>✓</Text>
              <Text style={[styles.featureText, { color: colors.text }]}>{feature}</Text>
            </View>
          ))}
        </View>

        <View style={styles.tiers}>
          {TIERS.map((t) => (
            <Card key={t.tier} style={styles.tierCard}>
              <View style={styles.tierHeader}>
                <Text style={[styles.tierTitle, { color: colors.text }]}>{t.title}</Text>
                {t.badge && <Badge label={t.badge} />}
              </View>
              <Text style={[styles.tierPrice, { color: colors.text }]}>
                {t.price}
                <Text style={[styles.tierPeriod, { color: colors.textSecondary }]}>
                  {" "}{t.period}
                </Text>
              </Text>
              <Button
                label="Start Free Trial"
                onPress={() => handleSubscribe(t.tier)}
                style={styles.tierBtn}
              />
            </Card>
          ))}
        </View>

        <Pressable onPress={handleRestore} style={styles.restoreRow}>
          <Text style={[styles.restore, { color: colors.textSecondary }]}>
            Restore purchases
          </Text>
        </Pressable>

        <Text style={[styles.legal, { color: colors.textTertiary }]}>
          Subscriptions auto-renew until cancelled. Payment is charged to your Apple ID account.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  closeRow: { alignItems: "flex-end", padding: Spacing.lg },
  close: { fontSize: FontSize.md },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxxl, gap: Spacing.xl },
  title: { fontSize: FontSize.xxxl, fontWeight: FontWeight.bold, textAlign: "center" },
  subtitle: { fontSize: FontSize.md, textAlign: "center" },
  features: { gap: Spacing.sm },
  featureRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  check: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  featureText: { fontSize: FontSize.md, flex: 1 },
  tiers: { gap: Spacing.md },
  tierCard: { gap: Spacing.md },
  tierHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tierTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  tierPrice: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold },
  tierPeriod: { fontSize: FontSize.md, fontWeight: FontWeight.regular },
  tierBtn: { borderRadius: Radius.lg },
  restoreRow: { alignItems: "center" },
  restore: { fontSize: FontSize.sm },
  legal: { fontSize: FontSize.xs, textAlign: "center", lineHeight: FontSize.xs * 1.5 },
});
