/**
 * See `docs/testing.md` / `home-screen.test.tsx` for the harness pattern this
 * copies.
 *
 * The auth provider is mocked using the same convention as
 * `useAuthStore.test.ts` (stable `mockProvider` object, wiped in place by
 * `resetProvider()`) rather than mocking `useAuthStore` directly, per
 * `docs/testing.md`'s instruction not to invent a second mocking convention.
 *
 * `app/(tabs)/settings.tsx:105-127` chains two native `Alert.alert` calls —
 * the first confirmation's destructive button opens a second alert, and only
 * the second's destructive button calls `performDelete`. Nothing here is
 * queryable through RTL, so the test spies on `Alert.alert`, captures each
 * call's button config, and invokes the callbacks manually to walk the chain.
 *
 * `SettingsScreen` is `require`d after `jest.mock` is registered rather than
 * statically imported. Babel hoists static `import`s above local `const`
 * declarations in the same file, so a static import of the screen — which
 * transitively imports `useAuthStore`, which imports the mocked module —
 * would read `mockProvider` before its initializer runs.
 */

import { Alert } from "react-native";
import { renderRouter, screen, fireEvent, waitFor, act } from "expo-router/testing-library";
import type { AuthProvider } from "../../services/auth/types";
import { useAppStore } from "../../store/useAppStore";

/**
 * The device appearance, so the Dark Mode switch's position is controllable.
 *
 * Mocked at the implementation module rather than at `react-native`: the index
 * re-exports this file, and replacing the whole `react-native` module here would
 * mean spreading `requireActual` over a namespace full of getters.
 */
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

const useColorScheme = jest.requireMock("react-native/Libraries/Utilities/useColorScheme")
  .default as jest.Mock;

/** Renders with the device in the given appearance, before the screen mounts. */
function setDeviceScheme(scheme: "light" | "dark") {
  useColorScheme.mockReturnValue(scheme);
}

const mockProvider = {} as AuthProvider & Record<string, unknown>;

function baseProvider(): AuthProvider {
  return {
    name: "mock",
    getSession: jest.fn().mockResolvedValue(null),
    signIn: jest.fn().mockResolvedValue(null),
    signUp: jest.fn().mockResolvedValue(null),
    signOut: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue(undefined),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {}),
  };
}

function resetProvider() {
  for (const key of Object.keys(mockProvider)) delete mockProvider[key];
  Object.assign(mockProvider, baseProvider());
}

jest.mock("../../services/auth", () => ({
  ...jest.requireActual("../../services/auth/types"),
  authErrorMessage: jest.requireActual("../../services/auth/messages").authErrorMessage,
  authProvider: mockProvider,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SettingsScreen = require("../../../app/(tabs)/settings")
  .default as typeof import("../../../app/(tabs)/settings").default;

const initialAppState = useAppStore.getState();

beforeEach(() => {
  resetProvider();
  jest.restoreAllMocks();
  // Same snapshot-and-restore as useAppStore.test.ts. The theme is real store
  // state, so without this the first test to write one leaks into the rest.
  useAppStore.setState(initialAppState, true);
  setDeviceScheme("light");
});

type AlertSpy = jest.SpyInstance<void, Parameters<typeof Alert.alert>>;

async function pressButton(alertSpy: AlertSpy, callIndex: number, buttonText: string) {
  const buttons = alertSpy.mock.calls[callIndex]![2]!;
  const button = buttons.find((b) => b.text === buttonText)!;
  await act(async () => {
    button.onPress!();
  });
}

/** Walks the two-alert confirmation chain: presses "Continue", then "Delete Account". */
async function confirmDeletion(alertSpy: AlertSpy) {
  await pressButton(alertSpy, 0, "Continue");
  await pressButton(alertSpy, 1, "Delete Account");
}

describe("SettingsScreen", () => {
  it("renders its sections", async () => {
    renderRouter({ index: SettingsScreen }, { initialUrl: "/" });

    expect(await screen.findByText("Settings")).toBeOnTheScreen();
    expect(screen.getByText("Appearance")).toBeOnTheScreen();
    expect(screen.getByText("Danger Zone")).toBeOnTheScreen();
    expect(screen.getByText("Delete Account")).toBeOnTheScreen();
  });

  it("does not delete the account after only the first confirmation", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    renderRouter({ index: SettingsScreen }, { initialUrl: "/" });
    await screen.findByText("Settings");

    fireEvent.press(screen.getByText("Delete Account"));
    expect(alertSpy).toHaveBeenCalledTimes(1);

    await pressButton(alertSpy, 0, "Continue");

    expect(mockProvider.deleteAccount).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(2);
  });

  it("deletes the account only once both confirmations are given", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    renderRouter({ index: SettingsScreen }, { initialUrl: "/" });
    await screen.findByText("Settings");

    fireEvent.press(screen.getByText("Delete Account"));
    await confirmDeletion(alertSpy);

    await waitFor(() => {
      expect(mockProvider.deleteAccount).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * The appearance control is one switch, not three (#129). `"device"` is still
   * the persisted default and the `hydrate` fallback — it is just no longer
   * selectable, so it exists only as the pre-touch state.
   *
   * The two properties worth pinning: the switch mirrors the device until first
   * touch (whichever appearance that is), and no flip ever writes `"device"`
   * back. The second is what keeps `.maestro/persistence.yaml`'s round trip
   * meaningful — it distinguishes a stored value from the fallback.
   */
  describe("appearance", () => {
    async function renderSettings() {
      renderRouter({ index: SettingsScreen }, { initialUrl: "/" });
      await screen.findByText("Settings");
    }

    it("renders a single Dark Mode switch, not the old three-way picker", async () => {
      await renderSettings();

      expect(screen.getByTestId("theme-dark-mode")).toBeOnTheScreen();
      expect(screen.queryByTestId("theme-light")).toBeNull();
      expect(screen.queryByTestId("theme-dark")).toBeNull();
      expect(screen.queryByTestId("theme-device")).toBeNull();
    });

    it("mirrors a light device before the first touch", async () => {
      setDeviceScheme("light");
      await renderSettings();

      expect(screen.getByTestId("theme-dark-mode").props.value).toBe(false);
      expect(screen.getByTestId("theme-following-device")).toBeOnTheScreen();
      expect(useAppStore.getState().theme).toBe("device");
    });

    it("mirrors a dark device before the first touch", async () => {
      // The case the stored value cannot show: nothing has been written, yet
      // the switch reads "on". Exactly why persistence.yaml asserts on the
      // description rather than on `checked`.
      setDeviceScheme("dark");
      await renderSettings();

      expect(screen.getByTestId("theme-dark-mode").props.value).toBe(true);
      expect(screen.getByTestId("theme-following-device")).toBeOnTheScreen();
      expect(useAppStore.getState().theme).toBe("device");
    });

    it("writes 'dark' when switched on from a light device", async () => {
      setDeviceScheme("light");
      await renderSettings();

      fireEvent(screen.getByTestId("theme-dark-mode"), "valueChange", true);

      expect(useAppStore.getState().theme).toBe("dark");
    });

    it("writes 'light' when switched off from a dark device", async () => {
      setDeviceScheme("dark");
      await renderSettings();

      fireEvent(screen.getByTestId("theme-dark-mode"), "valueChange", false);

      expect(useAppStore.getState().theme).toBe("light");
    });

    it("stops describing itself as following the device once touched", async () => {
      await renderSettings();

      fireEvent(screen.getByTestId("theme-dark-mode"), "valueChange", true);

      expect(screen.getByTestId("theme-set-manually")).toBeOnTheScreen();
      expect(screen.queryByTestId("theme-following-device")).toBeNull();
    });
  });

  it("surfaces an error alert when deleteAccount rejects, without crashing", async () => {
    (mockProvider.deleteAccount as jest.Mock).mockRejectedValue(new Error("boom"));
    const alertSpy = jest.spyOn(Alert, "alert");
    renderRouter({ index: SettingsScreen }, { initialUrl: "/" });
    await screen.findByText("Settings");

    fireEvent.press(screen.getByText("Delete Account"));
    await confirmDeletion(alertSpy);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Couldn't Delete Account",
        expect.stringContaining("Something went wrong")
      );
    });
  });
});
