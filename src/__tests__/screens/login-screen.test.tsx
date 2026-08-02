/**
 * Integration test for the two dev seams at the screen level — see
 * `src/__tests__/components/dev-seed-session-button.test.tsx` and
 * `dev-bypass-signin-button.test.tsx` for each gate's unit coverage in
 * isolation. This file asserts the same gates wired into the real
 * `app/(auth)/login.tsx` route, per `docs/testing.md` conventions.
 *
 * `../../env` is mocked once (hoisted, static) and each test mutates the
 * mock's properties directly rather than calling `jest.resetModules()` —
 * resetting the module registry mid-suite would load a second copy of React
 * alongside the one `renderRouter` already holds and break every hook in the
 * tree. Babel compiles named imports to a live property read on the module
 * object at each use site, so reassigning the mock's properties before render
 * is enough to flip the gate.
 */

import { renderRouter, screen } from "expo-router/testing-library";
import LoginScreen from "../../../app/(auth)/login";

// Spread the real module rather than replacing it: once a backend is wired, its
// adapter calls `requireEnv(...)` at module load, and a mock that omits it takes
// the whole suite down with "requireEnv is not a function" (#100). `env` stays
// overridden to `{}` — this file drives the bypass credentials through it.
jest.mock("../../env", () => ({
  ...jest.requireActual("../../env"),
  isDevBuild: true,
  backend: "none",
  env: {},
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockEnv = require("../../env") as {
  isDevBuild: boolean;
  backend: string;
  env: Record<string, string | undefined>;
};

const BYPASS_CREDENTIALS = {
  EXPO_PUBLIC_DEV_BYPASS_EMAIL: "dev@example.test",
  EXPO_PUBLIC_DEV_BYPASS_PASSWORD: "hunter2",
};

beforeEach(() => {
  mockEnv.isDevBuild = true;
  mockEnv.backend = "none";
  mockEnv.env = {};
});

describe("LoginScreen — dev-seed-session gate", () => {
  it("shows the dev-seed-session button when the gate is open", async () => {
    renderRouter({ index: LoginScreen }, { initialUrl: "/" });

    expect(await screen.findByTestId("dev-seed-session")).toBeOnTheScreen();
  });

  it("hides the button when the gate is closed, while the real screen still renders", async () => {
    mockEnv.isDevBuild = false;

    renderRouter({ index: LoginScreen }, { initialUrl: "/" });

    // Proves the screen itself rendered, so the missing button is about the
    // gate and not a broken render.
    expect(await screen.findByText("Sign In")).toBeOnTheScreen();
    expect(screen.queryByTestId("dev-seed-session")).toBeNull();
  });
});

describe("LoginScreen — dev-bypass-signin gate", () => {
  it("shows the bypass button when a backend is wired and both credentials are set", async () => {
    mockEnv.backend = "supabase";
    mockEnv.env = { ...BYPASS_CREDENTIALS };

    renderRouter({ index: LoginScreen }, { initialUrl: "/" });

    expect(await screen.findByTestId("dev-bypass-signin")).toBeOnTheScreen();
  });

  it("hides the button when the gate is closed, while the real screen still renders", async () => {
    mockEnv.isDevBuild = false;
    mockEnv.backend = "supabase";
    mockEnv.env = { ...BYPASS_CREDENTIALS };

    renderRouter({ index: LoginScreen }, { initialUrl: "/" });

    expect(await screen.findByText("Sign In")).toBeOnTheScreen();
    expect(screen.queryByTestId("dev-bypass-signin")).toBeNull();
  });

  it("hides the button when no backend is wired", async () => {
    mockEnv.env = { ...BYPASS_CREDENTIALS };

    renderRouter({ index: LoginScreen }, { initialUrl: "/" });

    expect(await screen.findByText("Sign In")).toBeOnTheScreen();
    expect(screen.queryByTestId("dev-bypass-signin")).toBeNull();
  });

  it("hides the button when only one half of the credential pair is set", async () => {
    mockEnv.backend = "supabase";
    mockEnv.env = { EXPO_PUBLIC_DEV_BYPASS_EMAIL: "dev@example.test" };

    renderRouter({ index: LoginScreen }, { initialUrl: "/" });

    expect(await screen.findByText("Sign In")).toBeOnTheScreen();
    expect(screen.queryByTestId("dev-bypass-signin")).toBeNull();
  });

  // The two dev affordances sit next to each other in the tree; each one's gate
  // has to exclude the other's case or a dev build would show both.
  it("never shows both dev buttons at once", async () => {
    mockEnv.backend = "supabase";
    mockEnv.env = { ...BYPASS_CREDENTIALS };

    renderRouter({ index: LoginScreen }, { initialUrl: "/" });

    expect(await screen.findByTestId("dev-bypass-signin")).toBeOnTheScreen();
    expect(screen.queryByTestId("dev-seed-session")).toBeNull();
  });
});
