#!/usr/bin/env node
/**
 * gen-privacy-policy.mjs — render a per-app privacy page for the focalstudio.github.io
 * Pages repo from the app's data practices.
 *
 *   Inputs : store-listing/privacy.config.json   (this app's data practices)
 *            src/constants.ts                     (APP_NAME/APP_SLUG/APP_COLOR/… — identity)
 *            store-listing/privacy-chrome.html    (site-chrome wrapper with {{TOKENS}})
 *   Output : store-listing/privacy-<slug>.html    (publish this to the Pages repo)
 *
 * Fails (non-zero exit) if any [PLACEHOLDER] survives, the #delete anchor is missing, or
 * PRIVACY_POLICY_URL in constants.ts does not end with privacy-<slug>.html — so a broken
 * or mislinked page can never be produced silently. See store-listing/PRIVACY.md.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = (...s) => join(ROOT, ...s);

function die(msg) {
  console.error(`\n✖ gen-privacy-policy: ${msg}\n`);
  process.exit(1);
}

// ── Read app identity from src/constants.ts ────────────────────────────────
function readConstants() {
  const src = readFileSync(p("src", "constants.ts"), "utf8");
  const grab = (name) => {
    const m = src.match(new RegExp(`export const ${name}\\s*=\\s*"([^"]*)"`));
    return m ? m[1] : null;
  };
  return {
    APP_NAME: grab("APP_NAME"),
    APP_SLUG: grab("APP_SLUG"),
    APP_COLOR: grab("APP_COLOR"),
    SUPPORT_EMAIL: grab("SUPPORT_EMAIL"),
    PRIVACY_POLICY_URL: grab("PRIVACY_POLICY_URL"),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const mailto = (email, subject) =>
  `<a href="mailto:${esc(email)}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}">${esc(email)}</a>`;

// ── Render the policy body from config ─────────────────────────────────────
function renderBody(cfg, C) {
  const email = C.SUPPORT_EMAIL;
  const backend = cfg.dataModel === "backend";
  const sections = []; // { title, html } — numbered after assembly

  // Intro (before section 1)
  const intro = `          <p>
            ${esc(C.APP_NAME)} is built by Focal Studio. This policy explains what data the
            app collects, why, and how you can remove it. If anything here is unclear, email
            ${mailto(email)}.
          </p>`;

  // 1. Information We Collect
  const accountPurpose = cfg.accountDetailsPurpose || "sign you in and sync your data across devices";
  const provided = backend
    ? `            <li><strong>Account details</strong> — your email address and display name, used to ${esc(accountPurpose)}.</li>
            <li><strong>App content</strong> — ${esc(cfg.userContent)}.</li>`
    : `            <li><strong>App content</strong> — ${esc(cfg.userContent)}. This stays on your device.</li>`;
  const autoLines = [];
  if (cfg.collectsAnalytics)
    autoLines.push(
      `            <li><strong>Anonymous usage analytics</strong> — which screens are opened and which features are used, so we can see what needs improving. This is not linked to your name or email, and you can turn it off entirely (see below).</li>`
    );
  if (cfg.collectsCrashReports)
    autoLines.push(
      `            <li><strong>Crash and error reports</strong> — technical details about failures, used only to fix bugs.</li>`
    );
  sections.push({
    title: "Information We Collect",
    html: `          <h3>Information you provide</h3>
          <ul>
${provided}
          </ul>${
            autoLines.length
              ? `\n          <h3>Information collected automatically</h3>\n          <ul>\n${autoLines.join("\n")}\n          </ul>`
              : ""
          }
          <div class="callout">
            <strong>We do not sell your data.</strong> We do not share it with advertisers,
            data brokers, or any third party for marketing purposes.
          </div>`,
  });

  // 2. Where data lives — cfg.whereDataLives overrides the default (e.g. hybrid models
  // where the account is hosted but content stays on-device).
  const whereDefault = backend
    ? `          <p>
            Data is stored in two places: locally on your device, and on our hosted backend
            (${esc(cfg.backendProvider)}) so it can sync across your devices. Data in transit
            is encrypted over HTTPS, and access is restricted so that you can only read and
            write your own records.
          </p>`
    : `          <p>
            All data is stored locally on your device. It never leaves your device and is
            never transmitted to us or any third party. It is cleared if you uninstall the app.
          </p>`;
  sections.push({
    title: "Where Your Data Lives",
    html: cfg.whereDataLives
      ? `          <p>${esc(cfg.whereDataLives)}</p>`
      : whereDefault,
  });

  // 3. Third-Party Services
  if (Array.isArray(cfg.thirdParties) && cfg.thirdParties.length) {
    const rows = cfg.thirdParties
      .map(
        (t) =>
          `            <tr><td>${esc(t.service)}</td><td>${esc(t.purpose)}</td><td>${esc(t.dataShared)}</td></tr>`
      )
      .join("\n");
    sections.push({
      title: "Third-Party Services",
      html: `          <table>
            <thead>
              <tr><th>Service</th><th>Purpose</th><th>Data shared</th></tr>
            </thead>
            <tbody>
${rows}
            </tbody>
          </table>`,
    });
  } else {
    sections.push({
      title: "Third-Party Services",
      html: `          <p>
            ${esc(C.APP_NAME)} does not integrate any third-party analytics, advertising, or
            social SDKs. No data is shared with or sold to any third party.
          </p>`,
    });
  }

  // 4. Turning Off Analytics
  if (cfg.collectsAnalytics) {
    sections.push({
      title: "Turning Off Analytics",
      html: `          <p>
            Analytics is optional. Open <strong>${esc(cfg.analyticsOptOutPath)}</strong> in the
            app and turn the <strong>Analytics</strong> toggle off. No further usage events are
            sent from that point on, and your choice persists across app restarts and updates.
          </p>`,
    });
  }

  // 5. Permissions
  if (Array.isArray(cfg.permissions) && cfg.permissions.length) {
    const items = cfg.permissions
      .map((perm) => {
        const plat =
          perm.platform && perm.platform !== "all"
            ? ` <em>(${esc(perm.platform === "ios" ? "iOS" : "Android")})</em>`
            : "";
        return `            <li><strong>${esc(perm.name)}</strong>${plat} — ${esc(perm.purpose)}</li>`;
      })
      .join("\n");
    sections.push({
      title: "Permissions",
      html: `          <p>${esc(C.APP_NAME)} requests only the permissions it needs:</p>
          <ul>
${items}
          </ul>`,
    });
  }

  // 6. Deletion (id="delete")
  const d = cfg.deletion || {};
  const steps = (d.steps || [])
    .map((s) => `            <li>${esc(s)}</li>`)
    .join("\n");
  const deleted = (d.deletedImmediately || [])
    .map((s) => `            <li>${esc(s)}</li>`)
    .join("\n");
  const retained = (d.retained || [])
    .map((r) => `            <li>${esc(r.item)}${r.reason ? ` — ${esc(r.reason)}` : ""}</li>`)
    .join("\n");
  let delHtml = d.inApp
    ? `          <p>You can delete your account and its data at any time, directly in the app:</p>
          <ol>
${steps}
          </ol>`
    : `          <p>You can request deletion of your account and its data at any time.</p>`;
  delHtml += `\n          <p><strong>Deleted immediately and permanently:</strong></p>
          <ul>
${deleted}
          </ul>`;
  if (retained) {
    delHtml += `\n          <p><strong>Retained, and why:</strong></p>
          <ul>
${retained}
          </ul>`;
  }
  if (d.emailFallback) {
    delHtml += `\n          <div class="callout">
            <strong>No longer have the app installed?</strong> Email
            ${mailto(email, "Data Deletion Request")} from the address on your account with
            the subject "Data Deletion Request". We will confirm your identity and delete the
            account within 30 days.
          </div>`;
  }
  sections.push({ title: "How to Delete Your Account and Data", html: delHtml, id: "delete" });

  // 7. Your Rights
  sections.push({
    title: "Your Rights",
    html: `          <p>
            Depending on where you live (including under GDPR and CCPA), you may have the right
            to access, correct, export, or delete your personal data, and to object to certain
            processing. Deletion is available as described above; for any other request, email
            ${mailto(email)} and we will respond within 30 days.
          </p>`,
  });

  // 8. Children's Privacy
  if (cfg.childrenNotice) {
    sections.push({
      title: "Children's Privacy",
      html: `          <p>
            ${esc(C.APP_NAME)} is not directed at children under 13, and we do not knowingly
            collect data from them. If you believe a child has provided us data, email
            ${mailto(email)} and we will delete it.
          </p>`,
    });
  }

  // 9. Changes
  sections.push({
    title: "Changes to This Policy",
    html: `          <p>
            We may update this policy as the app changes. The "Last updated" date at the top
            always reflects the current version. Material changes will be surfaced in the app.
          </p>`,
  });

  // 10. Contact
  sections.push({
    title: "Contact",
    html: `          <p>Questions about this policy or your data: ${mailto(email)}</p>`,
  });

  // Assemble with dynamic numbering
  const body = sections
    .map((s, i) => {
      const n = i + 1;
      const idAttr = s.id ? ` id="${s.id}"` : "";
      return `          <h2${idAttr}>${n}. ${esc(s.title)}</h2>\n${s.html}`;
    })
    .join("\n\n");

  return `${intro}\n\n${body}`;
}

// ── Main ───────────────────────────────────────────────────────────────────
const cfgPath = p("store-listing", "privacy.config.json");
if (!existsSync(cfgPath)) {
  die(
    "store-listing/privacy.config.json not found.\n  Copy the example and edit it:\n    cp store-listing/privacy.config.example.json store-listing/privacy.config.json"
  );
}
let cfg;
try {
  cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
} catch (e) {
  die(`privacy.config.json is not valid JSON: ${e.message}`);
}

const C = readConstants();
for (const [k, v] of Object.entries(C)) {
  if (!v) die(`could not read ${k} from src/constants.ts`);
}

const slug = C.APP_SLUG;
const expectedTail = `privacy-${slug}.html`;
if (!C.PRIVACY_POLICY_URL.endsWith(expectedTail)) {
  die(
    `PRIVACY_POLICY_URL in src/constants.ts ("${C.PRIVACY_POLICY_URL}") does not end with "${expectedTail}".\n  Per-app pages must live at privacy-<slug>.html — fix the URL or APP_SLUG.`
  );
}

const now = new Date();
const lastUpdated =
  !cfg.lastUpdated || cfg.lastUpdated === "auto"
    ? now.toLocaleString("en-US", { month: "long", year: "numeric" })
    : cfg.lastUpdated;

const body = renderBody(cfg, C);

let html = readFileSync(p("store-listing", "privacy-chrome.html"), "utf8");
// Strip the wrapper's authoring comment (everything up to the first <html ...>).
html = html.replace(/^<!DOCTYPE html>\s*<!--[\s\S]*?-->\s*/, "<!DOCTYPE html>\n");
html = html
  .replaceAll("{{LANG}}", esc(cfg.lang || "en"))
  .replaceAll("{{TITLE}}", esc(`Privacy Policy — ${C.APP_NAME}`))
  .replaceAll(
    "{{META_DESCRIPTION}}",
    esc(`Privacy Policy for ${C.APP_NAME}. What data the app collects, why, and how to delete it.`)
  )
  .replaceAll("{{ASSET_VERSION}}", esc(cfg.assetVersion || "1"))
  .replaceAll("{{APP_NAME}}", esc(C.APP_NAME))
  .replaceAll("{{LAST_UPDATED}}", esc(lastUpdated))
  .replaceAll("{{YEAR}}", String(now.getFullYear()))
  .replace("{{CONTENT}}", body); // single, un-escaped injection

// ── Validate output ────────────────────────────────────────────────────────
const leftoverToken = html.match(/\{\{[A-Z_]+\}\}/);
if (leftoverToken) die(`unfilled chrome token ${leftoverToken[0]} remains in output`);
const leftoverPlaceholder = html.match(/\[[A-Z][A-Z0-9_ ]+\]/);
if (leftoverPlaceholder)
  die(
    `placeholder ${leftoverPlaceholder[0]} remains — fill it in privacy.config.json before publishing`
  );
if (!/id="delete"/.test(html)) die("output is missing the #delete anchor (deletion section)");

const outPath = p("store-listing", `privacy-${slug}.html`);
writeFileSync(outPath, html);
console.log(`✓ wrote store-listing/privacy-${slug}.html`);
console.log(`  → publish to focalstudio.github.io as privacy-${slug}.html`);
console.log(`  → live URL: ${C.PRIVACY_POLICY_URL}  (deletion anchor: #delete)`);
