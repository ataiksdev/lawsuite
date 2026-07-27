// ============================================================================
// Lawmate - High Contrast Preference Store
// Independent of the light/dark theme (managed by next-themes): this is a
// simple on/off boost applied on top of whichever theme is active, aimed at
// elderly / low-vision users. Persisted so it survives reloads.
// ============================================================================

'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface HighContrastState {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (enabled: boolean) => void;
}

export const useHighContrastStore = create<HighContrastState>()(
  persist(
    (set) => ({
      enabled: false,
      toggle: () => set((state) => ({ enabled: !state.enabled })),
      setEnabled: (enabled) => set({ enabled }),
    }),
    { name: 'lawsuite-high-contrast' }
  )
);

export default useHighContrastStore;
