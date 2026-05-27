import { create } from "zustand";
import { STORAGE_PREFIX } from "../constants";
import { loadString, saveString } from "../utils/storage";

const ONBOARDING_KEY = `${STORAGE_PREFIX}onboarding_complete`;

type OnboardingState = {
  isComplete: boolean;
  isLoading: boolean;
  complete: () => void;
  hydrate: () => Promise<void>;
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  isComplete: false,
  isLoading: true,

  complete: () => {
    set({ isComplete: true });
    saveString(ONBOARDING_KEY, "true");
  },

  hydrate: async () => {
    const value = await loadString(ONBOARDING_KEY, "false");
    set({ isComplete: value === "true", isLoading: false });
  },
}));
