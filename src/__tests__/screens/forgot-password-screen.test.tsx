/**
 * See `docs/testing.md` / `home-screen.test.tsx` for the harness pattern this
 * copies.
 */

import { renderRouter, screen } from "expo-router/testing-library";
import ForgotPasswordScreen from "../../../app/(auth)/forgot-password";

describe("ForgotPasswordScreen", () => {
  it("renders the reset form", async () => {
    renderRouter({ index: ForgotPasswordScreen }, { initialUrl: "/" });

    expect(await screen.findByText("Reset password")).toBeOnTheScreen();
    expect(screen.getByPlaceholderText("you@example.com")).toBeOnTheScreen();
    expect(screen.getByText("Send Reset Link")).toBeOnTheScreen();
  });
});
