import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Tracks the OS "reduce motion" setting so animated affordances (shimmer,
 * pulses, slide-ins) can fall back to a static presentation.
 */
export const useReduceMotion = () => {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) {
        setReduceMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
};

/** True while VoiceOver / TalkBack is running. */
export const useScreenReader = () => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (isMounted) {
        setEnabled(value);
      }
    });

    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
};

/**
 * Announces a transient message (save confirmations, filter results) to
 * assistive technology. No-op when nothing is listening.
 */
export const announce = (message: string) => {
  if (Platform.OS === 'web') {
    return;
  }

  AccessibilityInfo.announceForAccessibility(message);
};
