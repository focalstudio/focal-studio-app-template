/**
 * Gate coverage for the dev sign-in bypass, mirroring
 * `dev-seed-session-button.test.tsx`. Same mocking idiom and the same reason for
 * it: `../../env` is mocked once (hoisted, static) and each test mutates the
 * mock's properties, because `jest.resetModules()` mid-suite would load a second
 * copy of React alongside the one the testing library holds.
 *
 * `env` is part of that mock here, since the component reads the credentials
 * from it — per render, not captured at module scope, which is what lets a test
 * swap them by assigning `mockEnv.env`.
 */

import { render, fireEvent, waitFor, screen } from "@testing-library/react-native";
import { DevBypassSignInButton } from "../../components/dev/DevBypassSignInButton";
import { useAuthStore } from "../../store/useAuthStore";

// Spread the real module rather than replacing it: once a backend is wired, its
// adapter calls `requireEnv(...)` at module load, and a mock that omits it takes
// the whole suite down with "requireEnv is not a function" (#100). `env` stays
// overridden to `{}` — this file drives the bypass credentials through it.
jest.mock("../../env", () => ({
  ...jest.requireActual("../../env"),
  isDevBuild: true,
  backend: "supabase",
  env: {},
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockEnv = require("../../env") as {
  isDevBuild: boolean;
  backend: string;
  env: Record<string, string | undefined>;
};

const CREDENTIALS = {
  EXPO_PUBLIC_DEV_BYPASS_EMAIL: "dev@example.test",
  EXPO_PUBLIC_DEV_BYPASS_PASSWORD: "hunter2",
};

const initialAuthState = useAuthStore.getState();

beforeEach(() => {
  useAuthStore.setState(initialAuthState, true);
  mockEnv.isDevBuild = true;
  mockEnv.backend = "supabase";
  mockEnv.env = { ...CREDENTIALS };
});

describe("DevBypassSignInButton — gate", () => {
  it("signs in through the real store action with the configured credentials", async () => {
    const signIn = jest.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ signIn });

    render(<DevBypassSignInButton />);
    const button = screen.getByTestId("dev-bypass-signin");
    expect(button).toBeTruthy();

    fireEvent.press(button);

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith("dev@example.test", "hunter2");
    });
  });

  // This is the production-reachability property. It proves the button cannot
  // exist outside a dev build, which is the entire point of the gate — and note
  // it is only half the defence: `stripDevBypass()` in app.config.js keeps the
  // credential itself out of a store bundle (see app-config.test.ts). Do not
  // remove either one.
  it("renders nothing when isDevBuild is false", () => {
    mockEnv.isDevBuild = false;

    render(<DevBypassSignInButton />);
    expect(screen.queryByTestId("dev-bypass-signin")).toBeNull();
  });

  // Without a backend, `signIn()` throws `not_wired` — DevSeedSessionButton owns
  // that case, and a button that can only fail is worse than no button.
  it("renders nothing when no backend is wired", () => {
    mockEnv.backend = "none";

    render(<DevBypassSignInButton />);
    expect(screen.queryByTestId("dev-bypass-signin")).toBeNull();
  });

  it("renders nothing when only one half of the credential pair is set", () => {
    mockEnv.env = { EXPO_PUBLIC_DEV_BYPASS_EMAIL: "dev@example.test" };

    render(<DevBypassSignInButton />);
    expect(screen.queryByTestId("dev-bypass-signin")).toBeNull();
  });

  it("surfaces a failed sign-in instead of leaving the button spinning", async () => {
    const signIn = jest.fn().mockRejectedValue(new Error("Invalid login credentials"));
    useAuthStore.setState({ signIn });
    jest.spyOn(console, "error").mockImplementation(() => {});

    render(<DevBypassSignInButton />);
    fireEvent.press(screen.getByTestId("dev-bypass-signin"));

    expect(await screen.findByText(/something went wrong/i)).toBeTruthy();
  });
});
