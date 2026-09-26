import { useEffect } from 'react';

import { addReminderDeliveryListener } from './notifications';
import useReminderStore from '@/store/reminderStore';

/**
 * Records delivered reminders into the store so the UI can show the most
 * recently fired one.
 *
 * Mount this once from the root layout, not from a screen — a reminder can
 * arrive while the user is on any tab, and we want it recorded either way.
 */
export function useReminderDelivery(): void {
  useEffect(() => {
    const subscription = addReminderDeliveryListener((fired) => {
      useReminderStore.getState().recordFired(fired);
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
