/**
 * Build-time environment validation.
 *
 * `app.config.js` requires this file, so the schema runs on every `expo start`,
 * `expo prebuild`, and EAS build. A missing or malformed variable fails the
 * build with a readable message instead of surfacing as `undefined` at runtime,
 * three screens deep, on a user's device.
 *
 * Runtime reads go through `src/env.ts`, which reads the validated values back
 * out of the Expo manifest — not `process.env`.
 */
const { z } = require("zod");

/**
 * Which backend this app uses. `scripts/add-backend.sh` rewrites this line;
 * it is what promotes that provider's variables from optional to required.
 *
 * @type {"none" | "supabase" | "firebase"}
 */
const BACKEND = "none";

const schema = z
  .object({
    // Analytics — optional by design. Empty disables PostHog entirely.
    EXPO_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
    EXPO_PUBLIC_POSTHOG_HOST: z.url().optional(),

    // Supabase
    EXPO_PUBLIC_SUPABASE_URL: z.url().optional(),
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),

    // Firebase (JS SDK path only — React Native Firebase reads
    // google-services.json / GoogleService-Info.plist instead)
    EXPO_PUBLIC_FIREBASE_API_KEY: z.string().min(1).optional(),
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1).optional(),
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1).optional(),
    EXPO_PUBLIC_FIREBASE_APP_ID: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    const require = (key) => {
      if (!env[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required because this app uses the "${BACKEND}" backend.`,
        });
      }
    };

    if (BACKEND === "supabase") {
      require("EXPO_PUBLIC_SUPABASE_URL");
      require("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    }

    if (BACKEND === "firebase") {
      require("EXPO_PUBLIC_FIREBASE_API_KEY");
      require("EXPO_PUBLIC_FIREBASE_PROJECT_ID");
      require("EXPO_PUBLIC_FIREBASE_APP_ID");
    }

    // A half-configured backend is the common failure: one variable gets
    // copied, the other is forgotten, and the client silently builds a broken
    // request. Catch it whichever provider is nominally selected.
    const supabase = [
      "EXPO_PUBLIC_SUPABASE_URL",
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ];
    const setCount = supabase.filter((k) => env[k]).length;
    if (setCount > 0 && setCount < supabase.length) {
      supabase
        .filter((k) => !env[k])
        .forEach((k) =>
          ctx.addIssue({
            code: "custom",
            path: [k],
            message: `${k} is missing. Supabase needs both the URL and the publishable key.`,
          })
        );
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");

  throw new Error(
    `\n❌ Invalid environment variables:\n\n${details}\n\n` +
      `Copy .env.example to .env.local and fill in the values.\n` +
      `Backend currently selected in env.js: "${BACKEND}".\n`
  );
}

module.exports = { env: parsed.data, BACKEND };
