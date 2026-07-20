import AsyncStorage from "@react-native-async-storage/async-storage";
import { useOnboardingStore } from "../useOnboardingStore";
import { STORAGE_PREFIX } from "../../constants";

const ONBOARDING_KEY = `${STORAGE_PREFIX}onboarding_complete`;

const initialState = useOnboardingStore.getState();

beforeEach(async () => {
  await AsyncStorage.clear();
  useOnboardingStore.setState(initialState, true);
});

describe("useOnboardingStore", () => {
  it("complete() sets isComplete and persists the string 'true'", async () => {
    useOnboardingStore.getState().complete();
    expect(useOnboardingStore.getState().isComplete).toBe(true);
    expect(await AsyncStorage.getItem(ONBOARDING_KEY)).toBe("true");
  });

  it("hydrate reads 'true' as complete", async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    await useOnboardingStore.getState().hydrate();
    const state = useOnboardingStore.getState();
    expect(state.isComplete).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it("hydrate with no stored key defaults to incomplete", async () => {
    await useOnboardingStore.getState().hydrate();
    const state = useOnboardingStore.getState();
    expect(state.isComplete).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it.each(["1", "yes", "TRUE", ""])(
    "hydrate treats any non-'true' string (%s) as incomplete",
    async (raw) => {
      await AsyncStorage.setItem(ONBOARDING_KEY, raw);
      await useOnboardingStore.getState().hydrate();
      expect(useOnboardingStore.getState().isComplete).toBe(false);
    }
  );

  it("reset() removes the persisted key and clears isComplete, confirmed by re-hydrating", async () => {
    useOnboardingStore.getState().complete();
    await useOnboardingStore.getState().reset();
    expect(useOnboardingStore.getState().isComplete).toBe(false);
    expect(await AsyncStorage.getItem(ONBOARDING_KEY)).toBeNull();

    await useOnboardingStore.getState().hydrate();
    expect(useOnboardingStore.getState().isComplete).toBe(false);
  });
});
