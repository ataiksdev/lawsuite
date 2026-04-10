// ============================================================================
// LegalOps - Filter Store
// Persists page-level filters across navigation using Zustand.
// Filters survive navigation and only clear when the user explicitly clears them.
// ============================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface KanbanFilters {
  search: string;
  matterFilter: string;
  assigneeFilter: string;
  myTasksOnly: boolean;
}

interface FilterStore {
  // Kanban board filters
  kanban: KanbanFilters;
  setKanbanFilters: (filters: Partial<KanbanFilters>) => void;
  clearKanbanFilters: () => void;

  // Matter list filters
  matterListSearch: string;
  matterListStatus: string;
  setMatterListFilters: (search: string, status: string) => void;
  clearMatterListFilters: () => void;

  // Client list filters
  clientListSearch: string;
  setClientListSearch: (search: string) => void;
  clearClientListFilters: () => void;
}

const DEFAULT_KANBAN: KanbanFilters = {
  search: '',
  matterFilter: 'all',
  assigneeFilter: 'all',
  myTasksOnly: false,
};

export const useFilterStore = create<FilterStore>()(
  persist(
    (set) => ({
      kanban: { ...DEFAULT_KANBAN },
      setKanbanFilters: (filters) =>
        set((s) => ({ kanban: { ...s.kanban, ...filters } })),
      clearKanbanFilters: () => set({ kanban: { ...DEFAULT_KANBAN } }),

      matterListSearch: '',
      matterListStatus: 'all',
      setMatterListFilters: (search, status) =>
        set({ matterListSearch: search, matterListStatus: status }),
      clearMatterListFilters: () =>
        set({ matterListSearch: '', matterListStatus: 'all' }),

      clientListSearch: '',
      setClientListSearch: (search) => set({ clientListSearch: search }),
      clearClientListFilters: () => set({ clientListSearch: '' }),
    }),
    {
      name: 'lawsuite-filters',
      // Persist kanban filters across sessions; list filters are session-only
      partialize: (s) => ({
        kanban: s.kanban,
      }),
    }
  )
);
