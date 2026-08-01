/**
 * Integration test for the dev-seed-session seam at the screen level — see
 * `src/__tests__/components/dev-seed-session-button.test.tsx` for the gate's
 * unit coverage in isolation. This file asserts the same gate wired into the
 * real `app/(auth)/login.tsx` route, per `docs/testing.md` conventions.
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

jest.mock("../../env", () => ({ isDevBuild: true, backend: "none" }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockEnv = require("../../env") as { isDevBuild: boolean; backend: string };

beforeEach(() => {
  mockEnv.isDevBuild = true;
  mockEnv.backend = "none";
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
