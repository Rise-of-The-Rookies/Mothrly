import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  DEFAULT_PERSONA_ID,
  getPersona,
  isPersonaId,
  type Persona,
  type PersonaId,
} from '@/data/personas';
import { zustandStorage } from '@/lib/storage';

/**
 * Which persona is currently speaking.
 *
 * Deliberately tiny: the store holds an id and nothing else. All the copy, the
 * accent colour and the premium flag live in `data/personas.ts`, so switching
 * persona is one string write and never a branch.
 *
 * Changing the persona invalidates copy that has already been handed to the OS,
 * so `store/reminderStore.ts` subscribes here and re-plans the scheduled batch.
 * That wiring lives there rather than in this file to keep the dependency one-way.
 */

export type PersonaStore = {
  /** The active persona id. Persisted. Defaults to {@link DEFAULT_PERSONA_ID}. */
  personaId: PersonaId;
  /** The selected voice ID for text-to-speech. */
  voiceId: string | null;
  /** Switches persona. A no-op when the id is already active or unrecognised. */
  setPersona: (id: PersonaId) => void;
  /** Sets the TTS voice ID. */
  setVoice: (voiceId: string | null) => void;
  /** Returns to the default persona. */
  resetToDefault: () => void;
};

const usePersonaStore = create<PersonaStore>()(
  persist(
    (set, get) => ({
      personaId: DEFAULT_PERSONA_ID,
      voiceId: null,

      setPersona: (id) => {
        if (!isPersonaId(id)) {
          console.warn(`[persona] Ignoring unknown persona id "${String(id)}"`);
          return;
        }
        if (get().personaId === id) return;
        set({ personaId: id });
      },

      setVoice: (voiceId) => {
        set({ voiceId });
      },

      resetToDefault: () => {
        set({ personaId: DEFAULT_PERSONA_ID, voiceId: null });
      },
    }),
    {
      name: 'mothrly.persona',
      storage: createJSONStorage(() => zustandStorage),
      version: 2, // Bump version
      partialize: (state) => ({ personaId: state.personaId, voiceId: state.voiceId }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<PersonaStore> | undefined;
        return { 
          ...current, 
          personaId: isPersonaId(stored?.personaId) ? stored.personaId : DEFAULT_PERSONA_ID,
          voiceId: stored?.voiceId ?? null
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn('[persona] Failed to rehydrate the selected persona', error);
        }
      },
    },
  ),
);

/**
 * The active persona id, read outside React.
 *
 * The way non-component code (the scheduler, the supervise nudge) should reach
 * for the persona — it never subscribes, so it always sees the current value.
 */
export function activePersonaId(): PersonaId {
  return usePersonaStore.getState().personaId;
}

/** The full active persona record, read outside React. */
export function activePersona(): Persona {
  return getPersona(activePersonaId());
}

/** Hook form of {@link activePersona}, for components that render persona styling. */
export function useActivePersona(): Persona {
  return getPersona(usePersonaStore((state) => state.personaId));
}

export default usePersonaStore;
