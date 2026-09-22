#!/usr/bin/env node
/**
 * fleet-html.mjs — render `fleet-report.sh --json` into one self-contained page.
 *
 *   Input  : the fleet JSON on stdin ({ org, generated, repos[] })
 *   Output : a complete HTML document on stdout
 *
 * Rendering lives here rather than in fleet-report.sh because the shell is a poor
 * place to build markup, and because `--json` was always the documented seam for a
 * second consumer. This is that consumer: the shell probes, this renders, and the
 * two can be changed independently.
 *
 * Self-contained on purpose — inline CSS, inline SVG, no CDN, no build step, no
 * fonts fetched, and deliberately no outbound links. The page is opened from a
 * file:// bookmark, often with no network, and a remote stylesheet would make a
 * local dashboard depend on someone else's uptime. Charts are hand-rolled SVG for
 * the same reason: a chart library is a network dependency wearing a nice API.
 *
 * It states what it does not know. A repo with no TEMPLATE_VERSION is rendered as
 * unknown, never as up to date: this page exists to be trusted at a glance, and a
 * false green is worse than an honest gap. The same rule governs a repo that has
 * never cut a release — it gets an explicit "never released" marker rather than a
 * zero-length bar, because a zero bar reads as "released today, nothing since".
 *
 * Framework drift is only ever measured inside one framework. Comparing a
 * Capacitor version against the fleet's modal Expo version produces a confident
 * number that means nothing, and one fabricated alarm is enough to teach someone
 * to stop reading the page.
 *
 * Colour follows the data-viz rules rather than taste: one hue does the chart work
 * (blue, the sequential/identity default), drift and failure wear the reserved
 * status scale, and every status colour ships with a symbol and a word so nothing
 * is carried by hue alone. Chart marks and status text were checked against both
 * surfaces rather than eyeballed — see the token block in the CSS.
 */

const STATUS = {
  red: { cls: "red", sym: "🔴", word: "attention" },
  amber: { cls: "amber", sym: "🟡", word: "watch" },
  green: { cls: "green", sym: "🟢", word: "current" },
  unknown: { cls: "unknown", sym: "⚪", word: "not tracked" },
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const cmpSemver = (a, b) => {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
};

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// SVG has no ellipsis-on-overflow, so labels are cut to a character budget derived
// from the glyph width of the page's sans at the label size. The full string always
// survives in the row's <title> and again in the table, so nothing is lost — only
// the glance is abbreviated.
const trunc = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

/**
 * The framework a repo is built on. `framework` is the field the shell now emits and
 * is authoritative; the `stack.expo` fallback exists so an older report — or a JSON
 * file someone saved last month — still renders something truthful instead of a row
 * of dashes. That fallback is the whole reason the Expo-only column was replaced:
 * it was blank for every repo that is not an Expo app, which is not the same as
 * "nothing known about it".
 */
function frameworkOf(repo) {
  const fw = repo.framework;
  if (fw?.name) {
    return { name: fw.name, version: fw.version || null, secondary: fw.secondary || null };
  }
  if (repo.stack?.expo) {
    return {
      name: "Expo",
      version: repo.stack.expo,
      secondary: repo.stack.react_native ? `React Native ${repo.stack.react_native}` : null,
    };
  }
  return { name: null, version: null, secondary: null };
}

/**
 * Modal version per framework, computed only where a framework has at least two
 * repos to be modal *about*. A single-repo framework has no fleet consensus to
 * deviate from, so it is left out entirely rather than being compared against
 * itself — which is what keeps the lone Capacitor app from ever being measured
 * against the Expo apps.
 */
function frameworkModes(repos) {
  const groups = {};
  for (const r of repos) {
    const fw = frameworkOf(r);
    if (!fw.name || !fw.version) continue;
    (groups[fw.name] ||= {});
    groups[fw.name][fw.version] = (groups[fw.name][fw.version] || 0) + 1;
  }
  const modes = {};
  for (const [name, versions] of Object.entries(groups)) {
    const total = Object.values(versions).reduce((a, b) => a + b, 0);
    if (total < 2) continue;
    modes[name] = Object.entries(versions).sort((a, b) => b[1] - a[1])[0][0];
  }
  return modes;
}

/**
 * One repo's verdict, and the reasons behind it. The reasons are rendered, not just
 * the colour — a dashboard that says "something is wrong" without saying what sends
 * you to the terminal anyway, which defeats the point of having it.
 *
 * `templateSelf` is the template's own version, read from the fleet data rather than
 * from a checkout, so a single-repo run cannot compare against whatever happens to
 * be on disk. Null when the template was not probed, which suppresses the comparison
 * instead of guessing at it.
 */
function assess(repo, templateSelf, modes) {
  const red = [];
  const amber = [];
  const fw = frameworkOf(repo);

  if (repo.kind === "app" || repo.kind === "template") {
    if (repo.ci?.conclusion && repo.ci.conclusion !== "success") {
      red.push(`last CI run on ${repo.default_branch} was ${repo.ci.conclusion}`);
    }
    if ((repo.open?.issues_hot ?? 0) > 0) {
      red.push(`${plural(repo.open.issues_hot, "open critical/high issue")}`);
    }
    if ((repo.release?.unreleased_commits ?? 0) > 0) {
      amber.push(
        `${plural(repo.release.unreleased_commits, "commit")} on ${repo.default_branch} past ${repo.release.tag}`,
      );
    }
    // Drift is measured within one framework only. `modes` has no entry for a
    // framework with a single repo, so the comparison simply does not happen there.
    const mode = fw.name ? modes[fw.name] : null;
    if (fw.version && mode && fw.version !== mode) {
      amber.push(`${fw.name} ${fw.version} — the rest of the ${fw.name} fleet is on ${mode}`);
    }
  }

  // Template currency. Only meaningful for generated apps: the template is not
  // behind itself, and a site or a non-descendant repo has no template to be on.
  let templateCell = "—";
  let behind = false;
  if (repo.kind === "app") {
    if (!repo.template_version) {
      templateCell = "unknown";
      amber.push("no TEMPLATE_VERSION — adoption cannot tell what it is missing");
    } else if (templateSelf) {
      const d = cmpSemver(templateSelf, repo.template_version);
      templateCell = repo.template_version;
      if (d > 0) {
        templateCell = `${repo.template_version} → ${templateSelf}`;
        behind = true;
        red.push(`behind the template (on ${repo.template_version}, template is ${templateSelf})`);
      }
    } else {
      templateCell = repo.template_version;
    }
  } else if (repo.kind === "template") {
    templateCell = repo.template_version ?? "—";
  }

  let status = STATUS.green;
  if (red.length) status = STATUS.red;
  else if (amber.length) status = STATUS.amber;
  if (repo.kind !== "app" && repo.kind !== "template" && !red.length && !amber.length) {
    status = STATUS.unknown;
  }
  // Each reason keeps its OWN severity. Rendering them all with the repo's overall
  // colour made an amber line inside a red repo read as red, which inflates
  // everything the moment one real problem exists — the exact failure that makes a
  // status page stop being read.
  const reasons = [
    ...red.map((why) => ({ why, sym: STATUS.red.sym, cls: "crit" })),
    ...amber.map((why) => ({ why, sym: STATUS.amber.sym, cls: "warn" })),
  ];
  return { status, reasons, templateCell, behind, fw };
}

// ---------------------------------------------------------------------------
// Charts. Hand-rolled SVG, one geometry helper each, no library.
// ---------------------------------------------------------------------------

/** A bar with a rounded data-end and a square baseline end. */
const barPath = (x, y, w, h, r = 4) => {
  if (w <= 0.75) return "";
  const rr = Math.min(r, w, h / 2);
  return (
    `M${x},${y} h${w - rr} a${rr},${rr} 0 0 1 ${rr},${rr} ` +
    `v${h - 2 * rr} a${rr},${rr} 0 0 1 ${-rr},${rr} h${-(w - rr)} z`
  );
};

/**
 * Horizontal bars, one row per repo, value direct-labelled at the tip.
 *
 * Every bar wears the same hue: the categories are repo names, which have no order,
 * and colouring them by their own value would spend the identity channel restating
 * the bar length. Rows with no value are not drawn as zero — `absent` renders an
 * open marker and says so in words, because "never released" and "released today"
 * are opposite facts that a zero-length bar renders identically.
 */
function hbars(items, { absent = "—" } = {}) {
  const W = 520;
  const ROW = 32;
  const LABEL_W = 172;
  // The value gutter has to hold the tip label *and* any trailing note, or the
  // longest bar pushes its note off the right edge — measured from the data rather
  // than guessed, so a longer note widens the gutter instead of overflowing it.
  const noteW = Math.max(0, ...items.map((i) => (i.note ? i.note.length * 6.6 + 10 : 0)));
  const VALUE_W = 82 + noteW;
  const BAR_H = 14;
  const plotX = LABEL_W;
  const plotW = W - LABEL_W - VALUE_W;
  const H = items.length * ROW + 8;
  const max = Math.max(1, ...items.map((i) => (typeof i.value === "number" ? i.value : 0)));

  const rows = items
    .map((it, i) => {
      const y = i * ROW + 4;
      const mid = y + ROW / 2 - 4;
      const has = typeof it.value === "number";
      const w = has ? (it.value / max) * plotW : 0;
      const mark = has
        ? `<path class="f" d="${barPath(plotX, mid - BAR_H / 2, w, BAR_H)}"/>` +
          `<text class="val" x="${plotX + Math.max(w, 2) + 9}" y="${mid + 4}">${esc(it.display)}</text>`
        : `<circle class="absent" cx="${plotX + 6}" cy="${mid}" r="4.5"/>` +
          `<text class="val muted" x="${plotX + 18}" y="${mid + 4}">${esc(absent)}</text>`;
      return (
        // The hit target is the whole row, not the 14px bar — a pointer should not
        // have to land on the mark to get the tooltip.
        `<g class="mk" tabindex="0"><title>${esc(it.title)}</title>` +
        `<rect class="hit" x="0" y="${y}" width="${W}" height="${ROW - 2}"/>` +
        `<text class="lbl" x="0" y="${mid + 4}">${esc(trunc(it.label, 25))}</text>` +
        mark +
        (it.note
          ? `<text class="note" x="${plotX + Math.max(w, 2) + 9 + it.display.length * 7.2}" y="${mid + 4}">${esc(it.note)}</text>`
          : "") +
        `</g>`
      );
    })
    .join("");

  return (
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" ` +
    `preserveAspectRatio="xMinYMin meet">` +
    `<line class="axis" x1="${plotX}" y1="2" x2="${plotX}" y2="${H - 4}"/>` +
    rows +
    `</svg>`
  );
}

/**
 * One band per framework, split into version segments by repo count.
 *
 * The form is deliberately part-to-whole rather than a bar chart of counts: what
 * matters is not "four Expo repos" but "three of the four agree and one does not",
 * and a band puts the disagreeing slice physically inside its own framework's bar
 * where it cannot be mistaken for drift against a different stack. Segments in the
 * warning colour also carry a symbol and the word "drift", so the outlier is never
 * signalled by hue alone.
 */
function versionSpine(groups) {
  const W = 520;
  const BAND = 24;
  const BLOCK = 66;
  const H = groups.length * BLOCK + 4;

  const blocks = groups
    .map((g, gi) => {
      const top = gi * BLOCK;
      const total = g.segs.reduce((a, s) => a + s.count, 0);
      const gap = g.segs.length > 1 ? 2 : 0;
      const usable = W - gap * (g.segs.length - 1);
      let x = 0;
      const segs = g.segs
        .map((s) => {
          const w = (s.count / total) * usable;
          const label = `${s.version}`;
          // Only set the label inside the segment when it actually fits with padding;
          // otherwise it goes under the band. Never clipped.
          const fits = w > label.length * 6.6 + 20;
          const out =
            `<g class="mk" tabindex="0">` +
            `<title>${esc(`${g.name} ${s.version} — ${plural(s.count, "repo")}: ${s.repos.join(", ")}${s.drift ? " (drift)" : ""}`)}</title>` +
            `<rect class="${s.drift ? "seg drift" : "seg"}" x="${x}" y="${top + 18}" width="${Math.max(w, 0)}" height="${BAND}"/>` +
            (fits
              ? `<text class="inseg ${s.drift ? "on-warn" : "on-accent"}" x="${x + 10}" y="${top + 18 + BAND / 2 + 4}">` +
                `${s.drift ? "⚠ " : ""}${esc(label)}</text>`
              : "") +
            `</g>`;
          const under = fits
            ? ""
            : `<text class="note" x="${x}" y="${top + 18 + BAND + 13}">${s.drift ? "⚠ " : ""}${esc(label)}</text>`;
          x += w + gap;
          return out + under;
        })
        .join("");
      return (
        `<clipPath id="spine-${gi}"><rect x="0" y="${top + 18}" width="${W}" height="${BAND}" rx="4"/></clipPath>` +
        `<text class="lbl strong" x="0" y="${top + 12}">${esc(g.name)}</text>` +
        `<text class="note" x="${W}" y="${top + 12}" text-anchor="end">${esc(plural(total, "repo"))}</text>` +
        `<g clip-path="url(#spine-${gi})">${segs}</g>`
      );
    })
    .join("");

  return (
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMinYMin meet">` +
    blocks +
    `</svg>`
  );
}

/** Roadmap meter: fill on a lighter step of its own ramp, so state reads across the whole track. */
function meter(roadmap) {
  if (!roadmap || roadmap.percent === null || roadmap.percent === undefined) {
    return `<span class="muted">—</span>`;
  }
  const pct = Math.max(0, Math.min(100, roadmap.percent));
  return (
    `<span class="meter" title="${esc(`${roadmap.done}/${roadmap.total} done on ${roadmap.ref ?? "default"}`)}">` +
    `<span class="meter-track"><span class="meter-fill" style="width:${pct}%"></span></span>` +
    `<span class="pct">${pct}%</span>` +
    `<span class="of">${esc(roadmap.done)}/${esc(roadmap.total)}</span></span>`
  );
}

/**
 * Release notes arrive as quoted markdown from `gh release view`. Strip the quoting
 * and the light markup rather than rendering the raw prefixes — the notes are the
 * only place the page says what actually shipped, and `> - **Thing.**` reads as
 * noise. Escaping still happens downstream: this only removes, never trusts.
 */
const cleanNote = (line) =>
  line
    .replace(/^\s*>\s?/, "")
    .replace(/^\s*[-*]\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();

// ---------------------------------------------------------------------------

const input = await new Promise((resolve) => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => (buf += d));
  process.stdin.on("end", () => resolve(buf));
});

let data;
try {
  data = JSON.parse(input);
} catch {
  console.error("fleet-html.mjs: stdin was not valid JSON (expected `fleet-report.sh --json`).");
  process.exit(1);
}

const repos = data.repos ?? [];
const templateRepo = repos.find((r) => r.kind === "template") ?? null;
const templateSelf = templateRepo?.template_version ?? null;
const modes = frameworkModes(repos);

const rows = repos
  .map((r) => ({ repo: r, ...assess(r, templateSelf, modes) }))
  .sort((a, b) => {
    const rank = { red: 0, amber: 1, unknown: 2, green: 3 };
    const d = rank[a.status.cls] - rank[b.status.cls];
    return d !== 0 ? d : a.repo.name.localeCompare(b.repo.name);
  });

const needsLook = rows.filter((r) => r.reasons.length);
const generated = new Date(data.generated ?? Date.now());

// --- fleet-level aggregates (the stat tiles) -------------------------------
const apps = rows.filter(({ repo }) => repo.kind === "app");
const hotTotal = rows.reduce((a, { repo }) => a + (repo.open?.issues_hot ?? 0), 0);
const hotRepos = rows.filter(({ repo }) => (repo.open?.issues_hot ?? 0) > 0).length;
const unreleasedTotal = rows.reduce((a, { repo }) => a + (repo.release?.unreleased_commits ?? 0), 0);
const unreleasedRepos = rows.filter(({ repo }) => (repo.release?.unreleased_commits ?? 0) > 0).length;
const prTotal = rows.reduce((a, { repo }) => a + (repo.open?.prs ?? 0), 0);
const prRepos = rows.filter(({ repo }) => (repo.open?.prs ?? 0) > 0).length;
const tmplUnknown = apps.filter(({ repo }) => !repo.template_version).length;
const tmplBehind = apps.filter((r) => r.behind).length;
const aheadTotal = rows.reduce((a, { repo }) => a + (repo.branches?.dev_ahead ?? 0), 0);
const oldest = rows
  .filter(({ repo }) => typeof repo.release?.age_days === "number")
  .sort((a, b) => b.repo.release.age_days - a.repo.release.age_days)[0];
const neverReleased = rows.filter(
  ({ repo }) => repo.kind !== "site" && typeof repo.release?.age_days !== "number",
);

const tiles = [
  {
    label: "Open critical / high",
    value: hotTotal,
    sub: hotRepos ? `across ${plural(hotRepos, "repo")}` : "nothing hot",
    tone: hotTotal > 0 ? "crit" : "good",
  },
  {
    label: "Unreleased commits",
    value: unreleasedTotal,
    sub: unreleasedRepos ? `past the last tag in ${plural(unreleasedRepos, "repo")}` : "everything is tagged",
    tone: unreleasedTotal > 0 ? "warn" : "good",
  },
  {
    label: "Template currency",
    value: tmplUnknown,
    sub:
      `unknown of ${plural(apps.length, "app")}` +
      (tmplBehind ? ` · ${tmplBehind} confirmed behind` : " · 0 confirmed behind"),
    tone: tmplUnknown > 0 ? "warn" : "good",
  },
  {
    label: "Oldest release",
    value: oldest ? `${oldest.repo.release.age_days}d` : "—",
    sub: oldest ? `${oldest.repo.name} · ${oldest.repo.release.tag}` : "nothing released yet",
    tone: oldest && oldest.repo.release.age_days > 60 ? "warn" : "plain",
  },
  {
    label: "Unmerged on dev",
    value: aheadTotal,
    sub: "commits ahead of the default branch",
    tone: "plain",
  },
  {
    label: "Open PRs",
    value: prTotal,
    sub: prRepos ? `across ${plural(prRepos, "repo")}` : "none open",
    tone: "plain",
  },
];

// --- chart data ------------------------------------------------------------
const recencyItems = rows
  .filter(({ repo }) => repo.kind !== "site")
  .slice()
  .sort((a, b) => {
    // Never-released sorts above the stalest release: it is the extreme of the same
    // scale, not a missing value to be swept to the bottom.
    const av = a.repo.release?.age_days;
    const bv = b.repo.release?.age_days;
    const an = typeof av !== "number";
    const bn = typeof bv !== "number";
    if (an && bn) return a.repo.name.localeCompare(b.repo.name);
    if (an) return -1;
    if (bn) return 1;
    return bv - av;
  })
  .map(({ repo }) => {
    const age = repo.release?.age_days;
    const has = typeof age === "number";
    return {
      label: repo.name,
      value: has ? age : null,
      display: has ? (age === 0 ? "today" : `${age}d`) : "",
      title: has
        ? `${repo.name} — ${repo.release.tag} published ${repo.release.published} (${age === 0 ? "today" : `${age} days ago`})`
        : `${repo.name} — no release has ever been published`,
    };
  });

const aheadItems = rows
  .filter(({ repo }) => typeof repo.branches?.dev_ahead === "number")
  .slice()
  .sort((a, b) => b.repo.branches.dev_ahead - a.repo.branches.dev_ahead)
  .map(({ repo }) => ({
    label: repo.name,
    value: repo.branches.dev_ahead,
    display: String(repo.branches.dev_ahead),
    note: repo.branches.dev_behind ? `↓${repo.branches.dev_behind} behind` : "",
    title:
      `${repo.name} — dev is ${plural(repo.branches.dev_ahead, "commit")} ahead of ${repo.default_branch}` +
      (repo.branches.dev_behind
        ? `, and ${plural(repo.branches.dev_behind, "commit")} behind it (needs a backmerge)`
        : ""),
  }));

const spineGroups = (() => {
  const byName = {};
  for (const { repo } of rows) {
    const fw = frameworkOf(repo);
    if (!fw.name || !fw.version) continue;
    ((byName[fw.name] ||= {})[fw.version] ||= []).push(repo.name);
  }
  return Object.entries(byName)
    .map(([name, versions]) => ({
      name,
      segs: Object.entries(versions)
        .sort((a, b) => b[1].length - a[1].length || cmpSemver(b[0].replace(/^\D+/, ""), a[0].replace(/^\D+/, "")))
        .map(([version, list]) => ({
          version,
          count: list.length,
          repos: list.slice().sort(),
          drift: Boolean(modes[name]) && version !== modes[name],
        })),
    }))
    .sort((a, b) => b.segs.reduce((x, s) => x + s.count, 0) - a.segs.reduce((x, s) => x + s.count, 0));
})();

const spineExcluded = rows
  .filter(({ repo }) => {
    const fw = frameworkOf(repo);
    return !fw.name || !fw.version;
  })
  .map(({ repo }) => `${repo.name} (${frameworkOf(repo).name ?? "framework unknown"})`);

const driftNotes = spineGroups
  .flatMap((g) => g.segs.filter((s) => s.drift).map((s) => `${s.repos.join(", ")} on ${g.name} ${s.version}, not ${modes[g.name]}`))
  .join(" · ");

const inFlight = rows.filter(({ repo }) => (repo.open?.pr_titles ?? []).length);

const releaseCards = rows
  .filter(({ repo }) => repo.release?.tag)
  .slice()
  .sort((a, b) => (a.repo.release.age_days ?? 1e9) - (b.repo.release.age_days ?? 1e9));

const cell = (v, cls = "") =>
  `<td class="${cls}">${v === "" || v === null || v === undefined ? '<span class="muted">—</span>' : esc(v)}</td>`;

const ageText = (r) =>
  typeof r.release?.age_days !== "number"
    ? "never"
    : r.release.age_days === 0
      ? "today"
      : `${r.release.age_days}d ago`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Focal Studio Fleet</title>
<style>
  /* Tokens. Chart marks and status text were measured against both surfaces, not
     eyeballed: blue mark 4.30:1 light / 4.79:1 dark; status text 6.37 / 5.39
     (critical), 5.77 / 9.49 (warning), 7.35 / 5.19 (good). The amber *fill* is
     below 3:1 on the light surface by design — every use of it carries a symbol
     and a word, which is the documented mitigation. */
  :root {
    --plane: #f9f9f7; --surface: #fcfcfb; --raise: #ffffff;
    --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
    --line: #e1e0d9; --axis: #c3c2b7; --ring: rgba(11,11,11,0.10);
    --accent: #2a78d6; --accent-soft: #cde2fb; --on-accent: #ffffff;
    --crit: #b3261e; --crit-mark: #d03b3b;
    --warn: #8a5a00; --warn-mark: #fab219; --on-warn: #0b0b0b;
    --good: #006300; --good-mark: #0ca30c;
    --wash: rgba(42,120,214,0.05);
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --plane: #0d0d0d; --surface: #1a1a19; --raise: #1f1f1e;
      --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
      --line: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
      --accent: #3987e5; --accent-soft: #0d366b; --on-accent: #ffffff;
      --crit: #e66767; --crit-mark: #e66767;
      --warn: #fab219; --warn-mark: #fab219; --on-warn: #0b0b0b;
      --good: #0ca30c; --good-mark: #0ca30c;
      --wash: rgba(57,135,229,0.08);
      color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --plane: #0d0d0d; --surface: #1a1a19; --raise: #1f1f1e;
    --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
    --line: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
    --accent: #3987e5; --accent-soft: #0d366b; --on-accent: #ffffff;
    --crit: #e66767; --crit-mark: #e66767;
    --warn: #fab219; --warn-mark: #fab219; --on-warn: #0b0b0b;
    --good: #0ca30c; --good-mark: #0ca30c;
    --wash: rgba(57,135,229,0.08);
    color-scheme: dark;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0 16px 72px; background: var(--plane); color: var(--ink);
    font: 14px/1.55 ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.92em; letter-spacing: -0.01em;
  }
  .wrap { max-width: 1240px; margin: 0 auto; }

  /* ---- masthead ---- */
  header { padding: 34px 0 22px; border-bottom: 1px solid var(--line); margin-bottom: 26px;
           background: linear-gradient(180deg, var(--wash), transparent 70%); }
  .eyebrow { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
  h1 { font-size: 30px; line-height: 1.1; margin: 6px 0 8px; letter-spacing: -0.025em; font-weight: 640; }
  .meta { color: var(--ink-2); font-size: 12.5px; }
  .meta b { font-weight: 600; color: var(--ink); }
  .head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; }

  /* Theme control. The page respects the OS by default; this only exists because a
     file:// bookmark is often opened beside a terminal in the opposite theme. */
  .theme { display: flex; gap: 0; border: 1px solid var(--ring); border-radius: 8px; overflow: hidden; }
  .theme button {
    font: inherit; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;
    background: transparent; color: var(--muted); border: 0; padding: 6px 10px; cursor: pointer;
  }
  .theme button + button { border-left: 1px solid var(--ring); }
  .theme button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); }

  /* ---- fleet ribbon ---- */
  .ribbon { display: flex; gap: 4px; margin-top: 20px; }
  .rib {
    flex: 1 1 0; min-width: 0; border-radius: 6px; padding: 7px 8px 8px;
    background: var(--surface); border: 1px solid var(--ring); border-top-width: 3px;
  }
  .rib.red { border-top-color: var(--crit-mark); }
  .rib.amber { border-top-color: var(--warn-mark); }
  .rib.green { border-top-color: var(--good-mark); }
  .rib.unknown { border-top-color: var(--axis); }
  .rib .n { display: block; font-size: 11.5px; font-weight: 600; overflow: hidden;
            text-overflow: ellipsis; white-space: nowrap; }
  .rib .s { display: block; font-size: 10.5px; color: var(--muted); }

  /* ---- tiles ---- */
  /* 140px keeps at least two columns down to a 320px viewport, so the hero tile's
     two-column span never has to invent an implicit column and overflow the page. */
  .tiles { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); margin-bottom: 22px; }
  .tile { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 14px 16px 15px; }
  .tile .lab { font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); }
  .tile .num { font-size: 30px; font-weight: 640; letter-spacing: -0.03em; margin-top: 4px; line-height: 1.05; }
  .tile .sub { font-size: 11.5px; color: var(--ink-2); margin-top: 3px; }
  .tile.hero { grid-column: span 2; background: var(--raise); }
  .tile.hero .num { font-size: 54px; letter-spacing: -0.04em; }
  .num.crit { color: var(--crit); } .num.warn { color: var(--warn); } .num.good { color: var(--good); }

  /* ---- cards ---- */
  .card { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; margin-bottom: 20px; overflow: hidden; }
  .card > h2 {
    font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.09em; color: var(--muted);
    margin: 0; padding: 13px 18px; border-bottom: 1px solid var(--line);
    display: flex; justify-content: space-between; gap: 12px; align-items: baseline; font-weight: 600;
  }
  .card > h2 .hint { text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 11.5px; }
  .grid2 { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); }
  .grid2 > .card { margin-bottom: 0; }
  .pad { padding: 16px 18px 18px; }

  /* ---- needs a look, grouped per repo ---- */
  .grp { border-bottom: 1px solid var(--line); padding: 12px 18px 13px 15px; border-left: 3px solid transparent; }
  .grp:last-child { border-bottom: 0; }
  .grp.red { border-left-color: var(--crit-mark); }
  .grp.amber { border-left-color: var(--warn-mark); }
  .grp-h { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
  .grp-h .who { font-weight: 640; font-size: 15px; letter-spacing: -0.01em; }
  .grp-h .count { margin-left: auto; font-size: 11px; color: var(--muted); }
  .why { list-style: none; margin: 7px 0 0; padding: 0; }
  .why li { display: flex; gap: 8px; padding: 2.5px 0; font-size: 13.5px; align-items: baseline; }
  .why .sev { flex: none; font-size: 10px; line-height: 1.7; }
  .why .crit { color: var(--crit); } .why .warn { color: var(--warn); }
  .ok { padding: 18px; color: var(--good); }

  .badge {
    font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted);
    border: 1px solid var(--ring); border-radius: 5px; padding: 1px 5px; white-space: nowrap;
  }

  /* ---- charts ---- */
  svg.chart { width: 100%; height: auto; display: block; overflow: visible; }
  svg.chart text { font-family: inherit; }
  .chart .lbl { font-size: 12.5px; fill: var(--ink-2); }
  .chart .lbl.strong { font-size: 13px; fill: var(--ink); font-weight: 600; }
  .chart .val { font-size: 12.5px; fill: var(--ink); font-variant-numeric: tabular-nums; }
  .chart .val.muted, .chart .note { fill: var(--muted); font-size: 11.5px; }
  .chart .f { fill: var(--accent); }
  .chart .seg { fill: var(--accent); }
  .chart .seg.drift { fill: var(--warn-mark); }
  .chart .inseg { font-size: 12px; font-weight: 600; }
  .chart .on-accent { fill: var(--on-accent); }
  .chart .on-warn { fill: var(--on-warn); }
  .chart .absent { fill: none; stroke: var(--axis); stroke-width: 1.5; }
  .chart .axis { stroke: var(--axis); stroke-width: 1; }
  .chart .hit { fill: transparent; }
  .chart .mk { cursor: default; }
  .chart .mk:hover .f, .chart .mk:hover .seg { opacity: 0.82; }
  .chart .mk:hover .hit, .chart .mk:focus-visible .hit { fill: var(--wash); }
  .chart .mk:focus { outline: none; }
  .chart .mk:focus-visible .f, .chart .mk:focus-visible .seg { opacity: 0.82; }
  .foot { font-size: 11.5px; color: var(--muted); padding: 10px 18px 14px; }
  .foot.warnline { color: var(--warn); }

  /* ---- table ---- */
  .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th {
    text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--muted); font-weight: 600; padding: 10px 11px; border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  td { padding: 10px 11px; border-bottom: 1px solid var(--line); white-space: nowrap; vertical-align: top; }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: var(--wash); }
  .name { font-weight: 640; letter-spacing: -0.01em; }
  .sub2 { display: block; font-size: 11px; color: var(--muted); font-weight: 400; margin-top: 1px; }
  .muted { color: var(--muted); }
  .red { color: var(--crit); } .amber { color: var(--warn); } .green { color: var(--good); }
  .behind { color: var(--crit); font-weight: 600; }

  .meter { display: inline-flex; align-items: center; gap: 7px; }
  .meter-track { display: inline-block; width: 68px; height: 7px; background: var(--accent-soft); border-radius: 4px; overflow: hidden; }
  .meter-fill { display: block; height: 100%; background: var(--accent); border-radius: 4px 0 0 4px; }
  .pct { font-size: 12px; }
  .of { font-size: 11px; color: var(--muted); }
  .evi { border-bottom: 1px dotted var(--muted); cursor: help; }

  /* ---- in flight / releases ---- */
  .pr-grp { padding: 11px 18px; border-bottom: 1px solid var(--line); }
  .pr-grp:last-child { border-bottom: 0; }
  .pr-grp .who { font-weight: 640; font-size: 13px; }
  .pr-grp ul { list-style: none; margin: 5px 0 0; padding: 0; }
  .pr-grp li { font-size: 13px; color: var(--ink-2); padding: 2px 0 2px 16px; position: relative; }
  .pr-grp li::before { content: "↳"; position: absolute; left: 0; color: var(--muted); }

  .rel-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); padding: 16px 18px 18px; }
  .rel { border: 1px solid var(--ring); border-radius: 10px; padding: 12px 13px; background: var(--raise); }
  .rel .top { display: flex; align-items: baseline; gap: 8px; justify-content: space-between; }
  .rel .who { font-weight: 640; font-size: 13.5px; }
  .rel .when { font-size: 11px; color: var(--muted); white-space: nowrap; }
  .rel ul { list-style: none; margin: 8px 0 0; padding: 0; }
  .rel li { font-size: 12.5px; color: var(--ink-2); padding: 3px 0 3px 12px; position: relative; line-height: 1.45; }
  .rel li::before { content: "—"; position: absolute; left: 0; color: var(--muted); }
  .rel .none { font-size: 12.5px; color: var(--muted); margin-top: 6px; }

  .legend { font-size: 12px; color: var(--ink-2); padding: 14px 18px; }
  .legend p { margin: 0 0 6px; }
  .legend p:last-child { margin-bottom: 0; }

  @media (max-width: 760px) {
    body { padding: 0 12px 52px; }
    h1 { font-size: 24px; }
    .tile.hero { grid-column: 1 / -1; }
    .tile.hero .num { font-size: 42px; }
    .ribbon { flex-wrap: wrap; }
    .rib { flex: 1 1 88px; }
    table { min-width: 940px; }
  }
</style>
</head>
<body>
<div class="wrap">
<header>
  <div class="head-row">
    <div>
      <div class="eyebrow">Fleet status</div>
      <h1>${esc(data.org ?? "Fleet")}</h1>
      <div class="meta">
        ${plural(repos.length, "repo")} ·
        generated <b>${esc(generated.toLocaleString())}</b>
        ${templateRepo ? `· template <b class="mono">${esc(templateRepo.version || "—")}</b>` : ""}
        ${templateSelf ? `· descendants compare against <b class="mono">${esc(templateSelf)}</b>` : "· no TEMPLATE_VERSION baseline to compare against"}
      </div>
    </div>
    <div class="theme" role="group" aria-label="Colour theme">
      <button type="button" data-set="auto" aria-pressed="true">Auto</button>
      <button type="button" data-set="light" aria-pressed="false">Light</button>
      <button type="button" data-set="dark" aria-pressed="false">Dark</button>
    </div>
  </div>
  <div class="ribbon">
    ${rows
      .map(
        ({ repo, status }) =>
          `<div class="rib ${status.cls}" title="${esc(`${repo.name} — ${status.word}`)}">` +
          `<span class="n">${status.sym} ${esc(repo.name)}</span>` +
          `<span class="s">${esc(status.word)}</span></div>`,
      )
      .join("")}
  </div>
</header>

<div class="tiles">
  <div class="tile hero">
    <div class="lab">Needs a look</div>
    <div class="num ${needsLook.length ? "crit" : "good"}">${needsLook.length}</div>
    <div class="sub">of ${plural(repos.length, "repo")} · ${rows.filter((r) => r.status.cls === "red").length} at attention, ${rows.filter((r) => r.status.cls === "amber").length} to watch</div>
  </div>
  ${tiles
    .map(
      (t) =>
        `<div class="tile"><div class="lab">${esc(t.label)}</div>` +
        `<div class="num ${t.tone === "plain" ? "" : t.tone}">${esc(t.value)}</div>` +
        `<div class="sub">${esc(t.sub)}</div></div>`,
    )
    .join("")}
</div>

<div class="card">
  <h2>Needs a look <span class="hint">grouped by repo · each line keeps its own severity</span></h2>
  ${
    needsLook.length
      ? needsLook
          .map(
            ({ repo, status, reasons }) =>
              `<div class="grp ${status.cls}">` +
              `<div class="grp-h">` +
              `<span>${status.sym}</span>` +
              `<span class="who">${esc(repo.name)}</span>` +
              `<span class="badge">${esc(repo.kind)}${repo.private ? " · private" : ""}</span>` +
              `<span class="count">${plural(reasons.length, "flag")}</span>` +
              `</div>` +
              `<ul class="why">${reasons
                .map(
                  ({ why, cls }) =>
                    `<li><span class="sev ${cls}">●</span><span>${esc(why)}</span></li>`,
                )
                .join("")}</ul>` +
              `</div>`,
          )
          .join("")
      : `<div class="ok">🟢 Nothing needs attention.</div>`
  }
</div>

<div class="grid2" style="margin-bottom:20px">
  <div class="card">
    <h2>Release recency <span class="hint">days since the last published tag</span></h2>
    <div class="pad">${hbars(recencyItems, { absent: "never released" })}</div>
    <div class="foot">${
      neverReleased.length
        ? `${esc(neverReleased.map(({ repo }) => repo.name).join(", "))} ${neverReleased.length === 1 ? "has" : "have"} never published a release — shown as an open marker, not a zero bar.`
        : "Every repo has published at least one release."
    }</div>
  </div>
  <div class="card">
    <h2>Unmerged work on dev <span class="hint">commits ahead of the default branch</span></h2>
    <div class="pad">${aheadItems.length ? hbars(aheadItems) : '<div class="muted">No dev branches reported.</div>'}</div>
    <div class="foot">A large lead is a release waiting to be cut. <span class="mono">↓n behind</span> means the default branch has commits <em>dev</em> does not — that repo needs a backmerge.</div>
  </div>
</div>

<div class="grid2" style="margin-bottom:20px">
  <div class="card">
    <h2>What the fleet is built with <span class="hint">versions compared only inside a framework</span></h2>
    <div class="pad">${
      spineGroups.length
        ? versionSpine(spineGroups)
        : '<div class="muted">No framework versions detected.</div>'
    }</div>
    ${driftNotes ? `<div class="foot warnline">⚠ Drift — ${esc(driftNotes)}.</div>` : `<div class="foot">No version drift inside any framework.</div>`}
    ${
      spineExcluded.length
        ? `<div class="foot">Not versioned, so not compared: ${esc(spineExcluded.join(", "))}.</div>`
        : ""
    }
  </div>
  <div class="card">
    <h2>In flight <span class="hint">open pull requests</span></h2>
    ${
      inFlight.length
        ? inFlight
            .map(
              ({ repo }) =>
                `<div class="pr-grp"><div class="who">${esc(repo.name)} <span class="badge">${plural(repo.open.prs, "PR")}</span></div>` +
                `<ul>${repo.open.pr_titles.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`,
            )
            .join("")
        : `<div class="ok">🟢 No open pull requests.</div>`
    }
  </div>
</div>

<div class="card">
  <h2>Fleet <span class="hint">the table view — every value on this page is readable here</span></h2>
  <div class="scroll">
  <table>
    <thead><tr>
      <th></th><th>Repo</th><th>Version</th><th>Released</th><th>Template</th>
      <th>Framework</th><th>Database</th><th>Paywall</th><th>Analytics</th>
      <th>CI</th><th>PRs</th><th>Issues</th><th>Roadmap</th>
    </tr></thead>
    <tbody>
    ${rows
      .map(({ repo: r, status, templateCell, fw }) => {
        const db =
          r.kind === "site"
            ? '<span class="muted">n/a</span>'
            : r.database?.evidence
              ? `<span class="evi" title="${esc(r.database.evidence)}">${esc(r.database.verdict)}</span>`
              : esc(r.database?.verdict ?? "—");
        const ciCls = !r.ci?.conclusion ? "muted" : r.ci.conclusion === "success" ? "green" : "red";
        const tmplCls = String(templateCell).includes("→")
          ? "behind"
          : templateCell === "unknown"
            ? "amber"
            : "";
        const mode = fw.name ? modes[fw.name] : null;
        const drifting = Boolean(fw.version && mode && fw.version !== mode);
        // A framework with no version (a static site) says so rather than printing a
        // dash beside its name, which reads as "Expo, version unknown".
        const fwCell = fw.name
          ? `<span class="${drifting ? "amber" : ""}">${drifting ? "⚠ " : ""}${esc(fw.name)}` +
            (fw.version ? ` <span class="mono">${esc(fw.version)}</span>` : "") +
            `</span>` +
            (fw.secondary
              ? `<span class="sub2 mono">${esc(fw.secondary)}</span>`
              : fw.version
                ? ""
                : `<span class="sub2">no versioned framework</span>`)
          : '<span class="muted">—</span>';
        return `<tr>
          <td title="${esc(status.word)}">${status.sym}</td>
          <td class="name">${esc(r.name)}<span class="sub2">${esc(r.kind)} · ${r.private ? "private" : "public"}</span></td>
          <td class="mono">${r.version ? esc(r.version) : '<span class="muted">—</span>'}</td>
          <td>${esc(ageText(r))}${r.release?.tag ? `<span class="sub2 mono">${esc(r.release.tag)}</span>` : ""}</td>
          <td class="${tmplCls} mono">${esc(templateCell)}</td>
          <td>${fwCell}</td>
          <td>${db}</td>
          ${cell(r.paywall?.verdict === "none" ? "" : r.paywall?.verdict)}
          ${cell(r.analytics?.verdict === "none" ? "" : r.analytics?.verdict)}
          <td class="${ciCls}">${esc(r.ci?.conclusion || "—")}${r.ci?.workflow ? `<span class="sub2">${esc(r.ci.workflow)}</span>` : ""}</td>
          ${cell(r.open?.prs)}
          <td>${esc(r.open?.issues ?? 0)}${
            (r.open?.issues_hot ?? 0) > 0
              ? ` <span class="red">(${esc(r.open.issues_hot)} hot)</span>`
              : ""
          }</td>
          <td>${meter(r.roadmap)}</td>
        </tr>`;
      })
      .join("")}
    </tbody>
  </table>
  </div>
</div>

<div class="card">
  <h2>Last shipped <span class="hint">the most recent release notes, newest first</span></h2>
  ${
    releaseCards.length
      ? `<div class="rel-grid">${releaseCards
          .map(({ repo: r }) => {
            const lines = String(r.release.notes ?? "")
              .split("\n")
              .map(cleanNote)
              .filter(Boolean)
              .slice(0, 3);
            return (
              `<div class="rel"><div class="top">` +
              `<span class="who">${esc(r.name)} <span class="mono">${esc(r.release.tag)}</span></span>` +
              `<span class="when">${esc(ageText(r))}</span></div>` +
              (lines.length
                ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
                : `<div class="none">No release notes were published with this tag.</div>`) +
              `</div>`
            );
          })
          .join("")}</div>`
      : `<div class="pad muted">Nothing has been released yet.</div>`
  }
</div>

<div class="card">
  <div class="legend">
    <p><strong>🔴 attention</strong> — behind the template by a release, CI not green, or an open critical/high issue.
       <strong>🟡 watch</strong> — unreleased commits past the last tag, a framework-version outlier, or no TEMPLATE_VERSION.
       <strong>🟢 current</strong> · <strong>⚪ not tracked</strong> — not a template descendant, so the template checks do not apply.</p>
    <p>A repo's colour is its worst reason, but <em>each reason keeps its own</em> in the list above — an amber line inside a red repo stays amber.</p>
    <p>Version drift is only ever measured against other repos on the <em>same</em> framework, and only where at least two of them exist. Hover a database verdict for the evidence behind it, and any chart mark for its detail.</p>
  </div>
</div>
</div>

<script>
// Theme control only. Everything else on this page is static markup — the report is
// a snapshot, and a snapshot that needs JavaScript to render is a snapshot that can
// fail to render. localStorage is unavailable on some file:// origins, so every
// access is guarded and the page falls back to the OS setting.
(function () {
  var root = document.documentElement;
  var btns = document.querySelectorAll(".theme button");
  function paint(v) {
    if (v === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", v);
    btns.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.set === v));
    });
  }
  var saved = "auto";
  try { saved = localStorage.getItem("fleet-theme") || "auto"; } catch (e) {}
  paint(saved);
  btns.forEach(function (b) {
    b.addEventListener("click", function () {
      paint(b.dataset.set);
      try { localStorage.setItem("fleet-theme", b.dataset.set); } catch (e) {}
    });
  });
})();
</script>
</body>
</html>
`;

process.stdout.write(html);
