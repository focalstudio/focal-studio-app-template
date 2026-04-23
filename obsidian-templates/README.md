# Obsidian Templates — [APP_NAME]

These templates give you a project-management hub in Obsidian from day one.

---

## Setup

1. Copy the four `.md` files from this folder into your Obsidian vault:
   ```
   /Users/fperezmartinez/Desktop/Obsidian_Felipe/Projects/[APP_NAME]/
   ```
   Create the folder first if it doesn't exist.

2. Rename each file — replace `[APP_NAME]` with your real app name:
   - `[APP_NAME] Dashboard.md` → `MyApp Dashboard.md`
   - `[APP_NAME] Kanban.md` → `MyApp Kanban.md`
   - `[APP_NAME] Roadmap.md` → `MyApp Roadmap.md`
   - `[APP_NAME] Claude Commands.md` → `MyApp Claude Commands.md`

3. Open the vault in Obsidian. The Kanban file requires the **Obsidian Kanban** community plugin to render as a board. Install it via Settings → Community plugins → Browse → "Kanban".

4. Update frontmatter in each file: replace `[APP_NAME]` in the `tags` array and any inline placeholders.

---

## File purposes

| File | Purpose |
|---|---|
| `Dashboard.md` | Launch status, decision gates, key metrics — the single source of truth for where the project stands |
| `Kanban.md` | Active work board (Backlog → In Progress → Review → Done), managed by the Kanban plugin |
| `Roadmap.md` | Phase-by-phase feature plan with priority tiers |
| `Claude Commands.md` | Prompt library — copy a pattern, paste into Claude Code, get a doc or decision back |

---

## Keeping them up to date

Ask Claude Code to refresh any document using the prompts in `Claude Commands.md`. For example:

```
Update the [APP_NAME] Dashboard to reflect version [X.X.X].
The [feature] is now done. Update milestone dates accordingly.
```

Add a new entry to `Claude Commands.md` whenever Claude produces a reusable prompt worth saving.
