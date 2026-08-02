/**
 * See `docs/testing.md` / `home-screen.test.tsx` for the harness pattern this
 * copies. Render-only: submit is not pressed, so no auth provider mocking is
 * needed here.
 */

import { renderRouter, screen } from "expo-router/testing-library";
import SignupScreen from "../../../app/(auth)/signup";

describe("SignupScreen", () => {
  it("renders the form and its affordances", async () => {
    renderRouter({ index: SignupScreen }, { initialUrl: "/" });

    expect(await screen.findByText("Create account")).toBeOnTheScreen();
    expect(screen.getByPlaceholderText("Your name")).toBeOnTheScreen();
    expect(screen.getByPlaceholderText("you@example.com")).toBeOnTheScreen();
    expect(screen.getByPlaceholderText("At least 8 characters")).toBeOnTheScreen();
    expect(screen.getByPlaceholderText("Repeat password")).toBeOnTheScreen();
    expect(screen.getByText("Create Account")).toBeOnTheScreen();
  });
});
