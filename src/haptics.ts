import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

async function nativeImpact(style: ImpactStyle) {
  try {
    await Haptics.impact({ style });
  } catch {
    // silently ignore on platforms where haptics aren't available
  }
}

async function nativeNotification(type: NotificationType) {
  try {
    await Haptics.notification({ type });
  } catch {
    // silently ignore
  }
}

function webVibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // silently ignore
  }
}

export function hapticStart() {
  if (Capacitor.isNativePlatform()) nativeImpact(ImpactStyle.Medium);
  else webVibrate(30);
}

export function hapticSuccess() {
  if (Capacitor.isNativePlatform()) nativeNotification(NotificationType.Success);
  else webVibrate([40, 60, 40]);
}

export function hapticFail() {
  if (Capacitor.isNativePlatform()) nativeNotification(NotificationType.Error);
  else webVibrate([80, 40, 80]);
}

export function hapticTap() {
  if (Capacitor.isNativePlatform()) nativeImpact(ImpactStyle.Light);
  else webVibrate(10);
}
