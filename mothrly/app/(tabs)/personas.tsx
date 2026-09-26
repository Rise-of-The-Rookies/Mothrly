import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import Character from '@/components/Character';
import { LockIcon } from '@/components/Icons';
import { PERSONAS, type Persona } from '@/data/personas';
import { usePremiumEntitlement } from '@/lib/revenuecat';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import usePersonaStore from '@/store/personaStore';

/**
 * Persona picker: which mood Mothrly is in.
 *
 * The grid is rendered straight from `PERSONAS`, so a persona added to that file
 * appears here with no change to this screen. The only thing a card computes for
 * itself is whether it is locked, which is the premium flag in the data crossed
 * with the live `premium_personas` entitlement.
 *
 * Picking a persona writes one id to `store/personaStore.ts`; re-planning the
 * scheduled notifications so they speak in the new voice is handled by a
 * subscription inside `store/reminderStore.ts`, not from here.
 */

/** Character size inside a card. Small enough that two fit a row comfortably. */
const CARD_CHARACTER_SIZE = 84;

export default function PersonasScreen() {
  const personaId = usePersonaStore((state) => state.personaId);
  const setPersona = usePersonaStore((state) => state.setPersona);

  // `isLoading` matters here: rendering premium cards as locked before the
  // entitlement has been read would flash a padlock at a paying customer.
  const { isPremium: hasPremium, isLoading } = usePremiumEntitlement();

  function openPaywall() {
    router.push('/paywall');
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Choose her mood</Text>
      <Text style={styles.subtitle}>
        Every mood says the same things in her own way. Her reminders change voice straight away.
      </Text>

      <View accessibilityRole="radiogroup" style={styles.grid}>
        {PERSONAS.map((persona) => (
          <PersonaCard
            key={persona.id}
            persona={persona}
            selected={persona.id === personaId}
            // Premium personas stay in limbo until the entitlement is known:
            // not shown as locked, but not selectable either, so a tap can't
            // slip a paid mood through while the answer is still in flight.
            locked={persona.isPremium && !hasPremium && !isLoading}
            pending={persona.isPremium && isLoading}
            onSelect={() => setPersona(persona.id)}
            onLockedPress={openPaywall}
          />
        ))}
      </View>

      {/* Nothing left to unlock once the entitlement is active, so the button
          retires rather than leading to a paywall for something already owned. */}
      {hasPremium ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Unlock all moods"
          accessibilityHint="Opens the upgrade options"
          onPress={openPaywall}
          style={({ pressed }) => [styles.unlockButton, pressed && styles.pressed]}
        >
          <Text style={styles.unlockButtonLabel}>Unlock all moods</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

/* -------------------------------------------------------------------------- */

type PersonaCardProps = {
  persona: Persona;
  /** Whether this is the active persona. Draws the accent border. */
  selected: boolean;
  /** Premium, and not paid for. Tapping opens the paywall instead of selecting. */
  locked: boolean;
  /** Premium, and the entitlement is still being read. Not yet interactive. */
  pending: boolean;
  onSelect: () => void;
  onLockedPress: () => void;
};

function PersonaCard({
  persona,
  selected,
  locked,
  pending,
  onSelect,
  onLockedPress,
}: PersonaCardProps) {
  const label = locked ? `${persona.name}, locked` : persona.name;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={
        locked ? 'Opens the upgrade options' : 'Sets this mood as the one she speaks in'
      }
      accessibilityState={{ selected, disabled: pending, busy: pending }}
      disabled={pending}
      onPress={locked ? onLockedPress : onSelect}
      style={({ pressed }) => [
        styles.card,
        // A 2px border is always present, transparent-to-border when inactive, so
        // selecting a card recolours it rather than resizing the grid.
        { borderColor: selected ? persona.accentColor : colors.border },
        pressed && styles.pressed,
        pending && styles.cardPending,
      ]}
    >
      <View style={styles.characterWrap}>
        {/* Dimmed rather than greyed out: the accent is the point of the card, and
            washing it to grey would lose the only preview of the mood. */}
        <View style={locked ? styles.characterLocked : undefined}>
          <Character
            size={CARD_CHARACTER_SIZE}
            color={persona.accentColor}
            // One breathing loop per card would read as four restless blobs.
            animated={false}
            // The Pressable already announces the persona name.
            decorative
          />
        </View>

        {locked ? (
          <View style={styles.lockBadge}>
            <LockIcon size={18} color={colors.primaryDark} />
          </View>
        ) : null}
      </View>

      <Text style={styles.cardName}>{persona.name}</Text>

      {/* Always rendered, blank when there is nothing to say, so every card in a
          row is the same height regardless of which one is active. */}
      <Text
        style={[styles.cardTag, selected && { color: persona.accentColor }]}
        // The border and the name already carry the state visually; announcing
        // "active" here would repeat what `accessibilityState` says.
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {selected ? 'Active' : locked ? 'Premium' : ' '}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    // `text` rather than `textMuted`: muted only reaches ~3.5:1 on cream, short
    // of the 4.5:1 AA threshold at this size.
    color: colors.text,
    marginTop: -spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // `space-between` rather than a column `gap`: the cards claim 48% each and
    // the leftover 4% becomes the gutter, which cannot overflow the row the way
    // a fixed gap added to two percentage widths can.
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  card: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardPending: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  characterWrap: {
    width: CARD_CHARACTER_SIZE,
    height: CARD_CHARACTER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  characterLocked: {
    opacity: 0.45,
  },
  lockBadge: {
    position: 'absolute',
    // Sits over the blob's shoulder rather than outside the card, so it reads as
    // belonging to the character and never clips the rounded corner.
    top: -2,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.text,
    textAlign: 'center',
  },
  cardTag: {
    fontFamily: fonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.text,
  },
  unlockButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  unlockButtonLabel: {
    // Cream on coral is the strongest pairing in the palette (~3.9:1), which
    // clears the 3:1 WCAG threshold for large text at bold 19px.
    color: colors.background,
    fontFamily: fonts.bold,
    fontSize: 19,
  },
});
