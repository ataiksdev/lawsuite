// ============================================================================
// Lawmate - Onboarding / Guided Tour Store
// Tracks whether a user has seen the "take a tour" prompt, and drives the
// state of an active guided tour (current step, active/inactive).
// Only `hasSeenPrompt` is persisted — the tour itself always starts fresh.
// ============================================================================

'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OnboardingState {
  hasSeenPrompt: boolean;
  isTourActive: boolean;
  stepIndex: number;

  markPromptSeen: () => void;
  startTour: () => void;
  stopTour: () => void;
  nextStep: (totalSteps: number) => void;
  prevStep: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasSeenPrompt: false,
      isTourActive: false,
      stepIndex: 0,

      markPromptSeen: () => set({ hasSeenPrompt: true }),

      startTour: () => set({ isTourActive: true, stepIndex: 0, hasSeenPrompt: true }),

      stopTour: () => set({ isTourActive: false, stepIndex: 0 }),

      nextStep: (totalSteps) =>
        set((state) => {
          const next = state.stepIndex + 1;
          if (next >= totalSteps) return { isTourActive: false, stepIndex: 0 };
          return { stepIndex: next };
        }),

      prevStep: () => set((state) => ({ stepIndex: Math.max(0, state.stepIndex - 1) })),
    }),
    {
      name: 'lawsuite-onboarding',
      partialize: (state) => ({ hasSeenPrompt: state.hasSeenPrompt }),
    }
  )
);

export default useOnboardingStore;
