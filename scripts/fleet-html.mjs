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
 * Self-contained on purpose — inline CSS, no CDN, no build step, no fonts fetched.
 * The page is opened from a file:// bookmark, often with no network, and a remote
 * stylesheet would make a local dashboard depend on someone else's uptime.
 *
 * It states what it does not know. A repo with no TEMPLATE_VERSION is rendered as
 * unknown, never as up to date: this page exists to be trusted at a glance, and a
 * false green is worse than an honest gap.
 */

const STATUS = {
  red: { cls: "red", sym: "🔴" },
  amber: { cls: "amber", sym: "🟡" },
  green: { cls: "green", sym: "🟢" },
  unknown: { cls: "unknown", sym: "⚪" },
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
function assess(repo, templateSelf, expoMode) {
  const red = [];
  const amber = [];

  if (repo.kind === "app" || repo.kind === "template") {
    if (repo.ci?.conclusion && repo.ci.conclusion !== "success") {
      red.push(`last CI run on ${repo.default_branch} was ${repo.ci.conclusion}`);
    }
    if ((repo.open?.issues_hot ?? 0) > 0) {
      red.push(`${repo.open.issues_hot} open critical/high issue(s)`);
    }
    if ((repo.release?.unreleased_commits ?? 0) > 0) {
      amber.push(
        `${repo.release.unreleased_commits} commit(s) on ${repo.default_branch} past ${repo.release.tag}`,
      );
    }
    if (repo.stack?.expo && expoMode && repo.stack.expo !== expoMode) {
      amber.push(`expo ${repo.stack.expo} — fleet is on ${expoMode}`);
    }
  }

  // Template currency. Only meaningful for generated apps: the template is not
  // behind itself, and a site or a non-descendant repo has no template to be on.
  let templateCell = "—";
  if (repo.kind === "app") {
    if (!repo.template_version) {
      templateCell = "unknown";
      amber.push("no TEMPLATE_VERSION — adoption cannot tell what it is missing");
    } else if (templateSelf) {
      const d = cmpSemver(templateSelf, repo.template_version);
      templateCell = repo.template_version;
      if (d > 0) {
        templateCell = `${repo.template_version} → ${templateSelf}`;
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
    ...red.map((why) => ({ why, sym: STATUS.red.sym })),
    ...amber.map((why) => ({ why, sym: STATUS.amber.sym })),
  ];
  return { status, reasons, templateCell };
}

function bar(pct) {
  if (pct === null || pct === undefined) return `<span class="muted">—</span>`;
  const filled = Math.round(pct / 5);
  return (
    `<span class="bar"><span class="bar-fill" style="width:${filled * 5}%"></span></span>` +
    `<span class="pct">${pct}%</span>`
  );
}

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
const templateSelf =
  repos.find((r) => r.kind === "template")?.template_version ?? null;

// Modal Expo version across apps — the same "what is everyone else on" comparison
// the terminal report makes, so one app's outlier reads the same in both.
const expoCounts = {};
for (const r of repos) {
  if ((r.kind === "app" || r.kind === "template") && r.stack?.expo) {
    expoCounts[r.stack.expo] = (expoCounts[r.stack.expo] || 0) + 1;
  }
}
const expoMode =
  Object.entries(expoCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

const rows = repos
  .map((r) => ({ repo: r, ...assess(r, templateSelf, expoMode) }))
  .sort((a, b) => {
    const rank = { red: 0, amber: 1, unknown: 2, green: 3 };
    const d = rank[a.status.cls] - rank[b.status.cls];
    return d !== 0 ? d : a.repo.name.localeCompare(b.repo.name);
  });

const needsLook = rows.filter((r) => r.reasons.length);
const generated = new Date(data.generated ?? Date.now());

const cell = (v, cls = "") =>
  `<td class="${cls}">${v === "" || v === null || v === undefined ? '<span class="muted">—</span>' : esc(v)}</td>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Focal Studio Fleet</title>
<style>
  :root {
    --bg: #f6f6f7; --card: #fff; --fg: #1c1c1e; --muted: #8a8a8e;
    --line: #e3e3e6; --red: #d7263d; --amber: #b8860b; --green: #1a7f37;
    --accent: #0a84ff; --bar-bg: #e3e3e6;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1011; --card: #18191b; --fg: #e8e8ea; --muted: #8a8a8e;
      --line: #2a2b2e; --red: #ff5c6c; --amber: #e0a91b; --green: #3fb950;
      --accent: #4aa3ff; --bar-bg: #2a2b2e;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px 64px; background: var(--bg); color: var(--fg);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", Segoe UI, sans-serif;
  }
  .wrap { max-width: 1180px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 2px; letter-spacing: -0.01em; }
  .sub { color: var(--muted); font-size: 12px; margin-bottom: 20px; }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 12px;
    margin-bottom: 20px; overflow: hidden;
  }
  .card h2 {
    font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--muted); margin: 0; padding: 12px 16px; border-bottom: 1px solid var(--line);
  }
  ul.attn { list-style: none; margin: 0; padding: 8px 0; }
  ul.attn li { padding: 5px 16px; }
  ul.attn .who { font-weight: 600; }
  .ok { padding: 14px 16px; color: var(--green); }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th {
    text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--muted); font-weight: 600; padding: 10px 10px; border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  td { padding: 11px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  tr:last-child td { border-bottom: 0; }
  .name { font-weight: 600; }
  .muted { color: var(--muted); }
  .red { color: var(--red); } .amber { color: var(--amber); } .green { color: var(--green); }
  .behind { color: var(--red); font-weight: 600; }
  .bar {
    display: inline-block; width: 74px; height: 6px; background: var(--bar-bg);
    border-radius: 3px; overflow: hidden; vertical-align: middle; margin-right: 7px;
  }
  .bar-fill { display: block; height: 100%; background: var(--accent); }
  .pct { font-size: 12px; color: var(--muted); }
  .evi { border-bottom: 1px dotted var(--muted); cursor: help; }
  .legend { font-size: 12px; color: var(--muted); padding: 10px 16px; }
  @media (max-width: 760px) {
    body { padding: 16px 12px 48px; }
    .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    table { min-width: 860px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>Focal Studio Fleet</h1>
  <div class="sub">
    ${esc(data.org ?? "")} · ${repos.length} repos ·
    generated ${esc(generated.toLocaleString())}
    ${templateSelf ? `· template on <strong>${esc(templateSelf)}</strong>` : ""}
  </div>

  <div class="card">
    <h2>Needs a look</h2>
    ${
      needsLook.length
        ? `<ul class="attn">${needsLook
            .map((r) =>
              r.reasons
                .map(
                  ({ why, sym }) =>
                    `<li>${sym} <span class="who">${esc(r.repo.name)}</span> — ${esc(why)}</li>`,
                )
                .join(""),
            )
            .join("")}</ul>`
        : `<div class="ok">🟢 Nothing needs attention.</div>`
    }
  </div>

  <div class="card">
    <h2>Fleet</h2>
    <div class="scroll">
    <table>
      <thead><tr>
        <th></th><th>Repo</th><th>Version</th><th>Released</th><th>Template</th>
        <th>Database</th><th>Expo</th><th>Paywall</th><th>Analytics</th>
        <th>CI</th><th>PRs</th><th>Issues</th><th>Roadmap</th>
      </tr></thead>
      <tbody>
      ${rows
        .map(({ repo: r, status, templateCell }) => {
          const age =
            r.release?.age_days === null || r.release?.age_days === undefined
              ? "never"
              : r.release.age_days === 0
                ? "today"
                : `${r.release.age_days}d ago`;
          const db =
            r.kind === "site"
              ? '<span class="muted">n/a</span>'
              : r.database?.evidence
                ? `<span class="evi" title="${esc(r.database.evidence)}">${esc(r.database.verdict)}</span>`
                : esc(r.database?.verdict ?? "—");
          const ciCls = !r.ci?.conclusion
            ? "muted"
            : r.ci.conclusion === "success"
              ? "green"
              : "red";
          const tmplCls = String(templateCell).includes("→") ? "behind" : "";
          return `<tr>
            <td>${status.sym}</td>
            <td class="name">${esc(r.name)}</td>
            ${cell(r.version)}
            ${cell(age, "muted")}
            <td class="${tmplCls}">${esc(templateCell)}</td>
            <td>${db}</td>
            ${cell(r.stack?.expo)}
            ${cell(r.paywall?.verdict === "none" ? "" : r.paywall?.verdict)}
            ${cell(r.analytics?.verdict === "none" ? "" : r.analytics?.verdict)}
            <td class="${ciCls}">${esc(r.ci?.conclusion || "—")}</td>
            ${cell(r.open?.prs)}
            <td>${esc(r.open?.issues ?? 0)}${
              (r.open?.issues_hot ?? 0) > 0
                ? ` <span class="red">(${esc(r.open.issues_hot)})</span>`
                : ""
            }</td>
            <td>${bar(r.roadmap?.percent ?? null)}</td>
          </tr>`;
        })
        .join("")}
      </tbody>
    </table>
    </div>
    <div class="legend">
      🔴 behind the template, failing CI, or a critical/high issue ·
      🟡 unreleased work, an Expo outlier, or no TEMPLATE_VERSION ·
      🟢 current · ⚪ not a template descendant.
      Issue counts show <span class="red">(critical/high)</span> in red.
      Hover a database verdict for the evidence behind it.
    </div>
  </div>
</div>
</body>
</html>
`;

process.stdout.write(html);
