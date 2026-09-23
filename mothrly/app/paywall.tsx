import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getOfferings } from '@/lib/revenuecat';

export default function PaywallScreen() {
  const router = useRouter();
  const [isFetching, setIsFetching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleFetchOffering = async () => {
    setIsFetching(true);
    setStatus(null);
    try {
      const offerings = await getOfferings();
      const current = offerings.current;

      // Full dump so the connection can be verified end to end in the console.
      console.log('[revenuecat] current offering:', JSON.stringify(current, null, 2));

      if (!current) {
        setStatus('Connected, but no current offering is set in the dashboard.');
        return;
      }
      setStatus(
        `Fetched offering "${current.identifier}" with ${current.availablePackages.length} package(s). See console.`,
      );
    } catch (error) {
      console.error('[revenuecat] failed to fetch offerings', error);
      setStatus(`Failed to fetch offerings: ${String(error)}`);
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Paywall</Text>
      <Text style={styles.subtitle}>Placeholder screen</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fetch current RevenueCat offering"
        accessibilityState={{ disabled: isFetching, busy: isFetching }}
        disabled={isFetching}
        style={[styles.button, isFetching && styles.buttonDisabled]}
        onPress={handleFetchOffering}
      >
        <Text style={styles.buttonText}>{isFetching ? 'Fetching…' : 'Fetch current offering'}</Text>
      </Pressable>

      {status ? (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {status}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        style={[styles.button, styles.secondaryButton]}
        onPress={() => router.back()}
      >
        <Text style={styles.buttonText}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 32,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    marginTop: 24,
    backgroundColor: '#8E8E93',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  status: {
    marginTop: 16,
    fontSize: 14,
    color: '#444',
    textAlign: 'center',
  },
});
