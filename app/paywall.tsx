import React, { useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useTheme } from "@/hooks/useTheme";
import { FontSize, FontWeight, Spacing, Radius } from "@/theme";
import { APP_NAME } from "@/constants";
import { isDevBuild } from "@/env";
import { usePaywallStore } from "@/store/usePaywallStore";
import { PaywallError, paywallErrorMessage } from "@/services/paywall";
import type { PaywallPackage } from "@/services/paywall";
import type { SubscriptionTier } from "@/types";

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
  /** Localized trial or intro copy from the store, when there is one. */
  note?: string;
};

/**
 * Title, period and badge stay app-authored — they are marketing copy, not store
 * data. Only the price comes from the store, because only the store knows it.
 */
const TIER_COPY: Record<
  Exclude<SubscriptionTier, "free">,
  { title: string; period: string; badge?: string }
> = {
  monthly: { title: "Monthly", period: "/ month" },
  annual: { title: "Annual", period: "/ year", badge: "Best Value" },
  lifetime: { title: "Lifetime", period: "one-time" },
};

const TIER_ORDER: Exclude<SubscriptionTier, "free">[] = ["monthly", "annual", "lifetime"];

/**
 * Rendered when the provider has no offering — no paywall wired, or a dashboard
 * with nothing in it. The layout and copy survive so the screen stays
 * designable; the price does not, because there is no honest value for it.
 *
 * The literal prices this replaced ("$4.99") were wrong in every non-USD
 * storefront and wrong the day a price changed in App Store Connect — an App
 * Store Guideline 3.1.2 problem the template shipped by default.
 */
const PLACEHOLDER_CARDS: TierCard[] = TIER_ORDER.map((tier) => ({
  tier,
  price: "—",
  ...TIER_COPY[tier],
}));

function toCard(pkg: PaywallPackage): TierCard | null {
  if (pkg.tier === "free") return null;
  return {
    tier: pkg.tier,
    price: pkg.priceString,
    note: pkg.introOffer ?? undefined,
    ...TIER_COPY[pkg.tier],
  };
}

export default function PaywallScreen() {
  const { colors } = useTheme();
  const offering = usePaywallStore((s) => s.offering);
  const isSubmitting = usePaywallStore((s) => s.isSubmitting);
  const loadOffering = usePaywallStore((s) => s.loadOffering);
  const purchase = usePaywallStore((s) => s.purchase);
  const restore = usePaywallStore((s) => s.restore);

  useEffect(() => {
    void loadOffering();
  }, [loadOffering]);

  const cards =
    offering && offering.packages.length > 0
      ? offering.packages.map(toCard).filter((c): c is TierCard => c !== null)
      : PLACEHOLDER_CARDS;

  async function handleSubscribe(tier: SubscriptionTier) {
    try {
      // A cancelled sheet is already swallowed by the store, so reaching the
      // line below means the purchase actually went through.
      await purchase(tier);
      router.back();
    } catch (err) {
      const pending = err instanceof PaywallError && err.code === "payment_pending";
      Alert.alert(pending ? "Approval Needed" : "Purchase Failed", paywallErrorMessage(err));
      // A pending purchase is not a failure — dismiss, and let the entitlement
      // listener in _layout.tsx unlock it when the payment clears.
      if (pending) router.back();
    }
  }

  async function handleRestore() {
    try {
      const restored = await restore();
      Alert.alert(
        restored ? "Purchases Restored" : "Nothing to Restore",
        restored
          ? `Your ${APP_NAME} subscription is active again.`
          : "We didn't find a previous purchase on this account."
      );
      if (restored) router.back();
    } catch (err) {
      Alert.alert("Restore Failed", paywallErrorMessage(err));
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Pressable style={styles.closeRow} onPress={() => router.back()}>
        <Text style={[styles.close, { color: colors.textSecondary }]}>Close</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Unlock {APP_NAME} Pro</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Choose the plan that fits you. Cancel anytime.
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
          {cards.map((t) => (
            <Card key={t.tier} style={styles.tierCard}>
              <View style={styles.tierHeader}>
                <Text style={[styles.tierTitle, { color: colors.text }]}>{t.title}</Text>
                {t.badge && <Badge label={t.badge} />}
              </View>
              <Text style={[styles.tierPrice, { color: colors.text }]}>
                {t.price}
                <Text style={[styles.tierPeriod, { color: colors.textSecondary }]}>
                  {" "}
                  {t.period}
                </Text>
              </Text>
              {t.note && (
                <Text style={[styles.tierNote, { color: colors.accent }]}>{t.note}</Text>
              )}
              <Button
                label="Continue"
                onPress={() => handleSubscribe(t.tier)}
                disabled={isSubmitting}
                style={styles.tierBtn}
              />
            </Card>
          ))}
        </View>

        {/*
          Gated on the canonical `isDevBuild` rather than `__DEV__`, so a shipped
          app that was never wired shows placeholder prices without also showing
          developer instructions to its users.
        */}
        {isDevBuild && offering === null && (
          <Text style={[styles.devHint, { color: colors.textTertiary }]}>
            Prices load from your store. Run `bash scripts/add-paywall.sh revenuecat` to wire one.
          </Text>
        )}

        <Pressable onPress={handleRestore} disabled={isSubmitting} style={styles.restoreRow}>
          <Text style={[styles.restore, { color: colors.textSecondary }]}>Restore purchases</Text>
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
  tierNote: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  tierBtn: { borderRadius: Radius.lg },
  devHint: { fontSize: FontSize.xs, textAlign: "center" },
  restoreRow: { alignItems: "center" },
  restore: { fontSize: FontSize.sm },
  legal: { fontSize: FontSize.xs, textAlign: "center", lineHeight: FontSize.xs * 1.5 },
});
