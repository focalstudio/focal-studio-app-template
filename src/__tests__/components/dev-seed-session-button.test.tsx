/**
 * `isDevBuild` and `backend` are module-level constants exported from
 * `src/env.ts`. `../../env` is mocked once (hoisted, static — `jest.mock`
 * rather than `jest.resetModules()` + `jest.doMock`, which would load a
 * second copy of React alongside the one `@testing-library/react-native`
 * already holds and break every hook in the tree). Each test instead mutates
 * the mock module's properties directly: Babel compiles named imports to a
 * live property read on the required module object
 * (`_env.isDevBuild`/`_env.backend` at each use site), not a one-time
 * destructure, so reassigning the mock's properties before each render is
 * enough to flip the gate.
 */

import { render, fireEvent, waitFor, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DevSeedSessionButton } from "../../components/dev/DevSeedSessionButton";
import { useAuthStore } from "../../store/useAuthStore";

// Spread the real module rather than replacing it: once a backend is wired, its
// adapter calls `requireEnv(...)` at module load, and a mock that omits it takes
// the whole suite down with "requireEnv is not a function" (#100). Only the two
// values this file drives are overridden.
jest.mock("../../env", () => ({
  ...jest.requireActual("../../env"),
  isDevBuild: true,
  backend: "none",
}));

/**
 * Pin the port to the local scaffold.
 *
 * This suite drives the gate by mutating the mocked `backend`, but
 * `scripts/add-backend.sh` rewrites `authProvider` in the barrel — so in a wired
 * app the seed test would press the button with `backend: "none"` while
 * `hydrate()` asks the *real* adapter for a session. `seedLocalSession` writes
 * the local scaffold's AsyncStorage key and no other provider reads it, so the
 * round-trip silently fails to sign in (#100).
 *
 * Pinning here restores the only configuration in which this button exists at
 * all, per its own gate. Faking at the `AuthProvider` port rather than at the
 * SDK is the convention — see `docs/testing.md`. No-op in the un-wired template,
 * where `authProvider` is already `localAuthProvider`.
 */
jest.mock("../../services/auth", () => ({
  ...jest.requireActual("../../services/auth"),
  authProvider: jest.requireActual("../../services/auth/local").localAuthProvider,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockEnv = require("../../env") as { isDevBuild: boolean; backend: string };

const initialAuthState = useAuthStore.getState();

beforeEach(async () => {
  await AsyncStorage.clear();
  useAuthStore.setState(initialAuthState, true);
  mockEnv.isDevBuild = true;
  mockEnv.backend = "none";
});

describe("DevSeedSessionButton — gate", () => {
  it("renders and seeds a signed-in session when isDevBuild is true and backend is none", async () => {
    render(<DevSeedSessionButton />);
    const button = screen.getByTestId("dev-seed-session");
    expect(button).toBeTruthy();

    fireEvent.press(button);

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
    expect(useAuthStore.getState().user?.id).toBe("dev-seed-user");
  });

  // This is the production-reachability property — the single most important
  // assertion in this PR. Never delete it as "redundant" with the render
  // assertion above: it proves the button cannot exist outside a dev build,
  // which is the entire point of the gate. Do not remove.
  it("renders nothing when isDevBuild is false, even with no backend wired", () => {
    mockEnv.isDevBuild = false;

    render(<DevSeedSessionButton />);
    expect(screen.queryByTestId("dev-seed-session")).toBeNull();
  });

  it("renders nothing when isDevBuild is true but a real backend is wired", () => {
    mockEnv.backend = "supabase";

    render(<DevSeedSessionButton />);
    expect(screen.queryByTestId("dev-seed-session")).toBeNull();
  });
});
