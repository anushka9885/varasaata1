/**
 * Cross-platform haptic feedback helper for VARASAATA.
 * Uses @capacitor/haptics on native Android/iOS and falls back
 * to navigator.vibrate on mobile browsers.
 */

export type HapticType = "light" | "medium" | "heavy" | "success" | "warning" | "error" | "selection";

export async function triggerHaptic(type: HapticType = "light"): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");

    switch (type) {
      case "selection":
        await Haptics.selectionChanged();
        break;
      case "light":
        await Haptics.impact({ style: ImpactStyle.Light });
        break;
      case "medium":
        await Haptics.impact({ style: ImpactStyle.Medium });
        break;
      case "heavy":
        await Haptics.impact({ style: ImpactStyle.Heavy });
        break;
      case "success":
        await Haptics.notification({ type: NotificationType.Success });
        break;
      case "warning":
        await Haptics.notification({ type: NotificationType.Warning });
        break;
      case "error":
        await Haptics.notification({ type: NotificationType.Error });
        break;
    }
    return;
  } catch {
    // Native plugin not available or errored, try web vibration API
  }

  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      switch (type) {
        case "light":
        case "selection":
          navigator.vibrate(15);
          break;
        case "medium":
          navigator.vibrate(28);
          break;
        case "heavy":
          navigator.vibrate(45);
          break;
        case "success":
          navigator.vibrate([20, 40, 30]);
          break;
        case "warning":
          navigator.vibrate([30, 50, 30]);
          break;
        case "error":
          navigator.vibrate([50, 40, 50, 40]);
          break;
      }
    }
  } catch {
    // Vibration ignored or permission not granted
  }
}
