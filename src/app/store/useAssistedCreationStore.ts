import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createEmptyAssistedCreationDraft,
  parseAssistedCreationDraft,
  type AssistedCreationDraft,
  type AssistedCreativeDirection,
  type CreativeConcept,
} from "@/lib/assisted-creation";

export const ASSISTED_CREATION_STORAGE_KEY = "blink-assisted-creation-draft";

interface AssistedCreationState {
  draft: AssistedCreationDraft | null;
  hasHydrated: boolean;
  initializeBrand: (brandId: string) => void;
  setIdea: (brandId: string, idea: string) => void;
  setConcepts: (brandId: string, concepts: CreativeConcept[]) => void;
  selectConcept: (brandId: string, concept: CreativeConcept) => void;
  setDirection: (brandId: string, direction: AssistedCreativeDirection) => void;
  setSummary: (brandId: string, summary: string) => void;
  revealAdvanced: (brandId: string) => void;
  setHandoff: (brandId: string, direction: AssistedCreativeDirection) => void;
  clearDraft: () => void;
  setHasHydrated: (value: boolean) => void;
}

const forBrand = (draft: AssistedCreationDraft | null, brandId: string) =>
  draft?.brandId === brandId ? draft : createEmptyAssistedCreationDraft(brandId);

export const useAssistedCreationStore = create<AssistedCreationState>()(
  persist(
    (set) => ({
      draft: null,
      hasHydrated: false,
      initializeBrand: (brandId) => set((state) => state.draft?.brandId === brandId ? state : { draft: createEmptyAssistedCreationDraft(brandId) }),
      setIdea: (brandId, idea) => set((state) => ({ draft: { ...forBrand(state.draft, brandId), idea, concepts: [], selectedConcept: null, direction: null, step: "idea", handoff: null } })),
      setConcepts: (brandId, concepts) => set((state) => ({ draft: { ...forBrand(state.draft, brandId), concepts, selectedConcept: null, direction: null, step: "concepts", handoff: null } })),
      selectConcept: (brandId, selectedConcept) => set((state) => ({ draft: { ...forBrand(state.draft, brandId), selectedConcept, direction: null, step: "concepts", handoff: null } })),
      setDirection: (brandId, direction) => set((state) => ({ draft: { ...forBrand(state.draft, brandId), direction, step: "direction", handoff: null } })),
      setSummary: (brandId, summary) => set((state) => {
        const draft = forBrand(state.draft, brandId);
        return draft.direction ? { draft: { ...draft, direction: { ...draft.direction, summary }, handoff: draft.handoff ? { ...draft.handoff, prompt: summary } : null } } : state;
      }),
      revealAdvanced: (brandId) => set((state) => ({ draft: { ...forBrand(state.draft, brandId), advancedRevealed: true } })),
      setHandoff: (brandId, direction) => set((state) => ({ draft: { ...forBrand(state.draft, brandId), direction, step: "handoff", advancedRevealed: true, handoff: { prompt: direction.summary, style: direction.style, mode: "standard" } } })),
      clearDraft: () => set({ draft: null }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: ASSISTED_CREATION_STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ draft: state.draft }),
      merge: (persisted, current) => {
        const saved = persisted as { draft?: unknown } | undefined;
        return { ...current, draft: parseAssistedCreationDraft(saved?.draft) };
      },
      migrate: () => ({ draft: null }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
