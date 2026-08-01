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

beforeEach(() => {
  resetProvider();
  jest.restoreAllMocks();
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
