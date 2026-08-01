# Obsidian documentation conventions

> Extracted from `.claude/CLAUDE.md` to keep the always-loaded instructions small.
> Read this file when producing or refreshing a vault doc.

The project Obsidian vault lives at:
```
/Users/fperezmartinez/Desktop/Obsidian_Felipe/Projects/[APP_NAME]/
```

### When to produce Obsidian docs
Produce or update Obsidian documents whenever:
- A full codebase analysis or audit is completed (roadmap, status review)
- A new phase of work is planned or prioritised
- A significant feature is shipped and the roadmap needs refreshing
- The user explicitly asks for a doc, kanban, or dashboard

### File naming convention
Use plain `.md` extension. Keep names short and descriptive:
- `[APP_NAME] Dashboard.md` — at-a-glance status, today's tasks, milestone dates
- `[APP_NAME] Roadmap.md` — full narrative roadmap, phased, with branch names
- `[APP_NAME] Kanban.md` — Kanban plugin board, one column per phase + Done column

### Obsidian formatting rules
Always use:
- **YAML frontmatter** with `tags`, `created`, and optionally `version`
- **Callouts** for warnings, tips, and danger notices: `> [!note]`, `> [!warning]`, `> [!danger]`, `> [!tip]`
- **Wiki links** to cross-reference files: `[[APP_NAME Roadmap]]`
- **Status emoji** in tables: ✅ Done · ❌ Missing · ⏳ Planned · ⚠️ Partial
- **Priority emoji** for items: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Later · ⬜ Deferred
- **Checkboxes** `- [ ]` for all actionable items so the Tasks plugin can track them
- **Tags** on items using `#tag` syntax (e.g. `#critical`, `#high`, `#medium`, `#low`)

### Kanban board format (requires Obsidian Kanban plugin)
```
---
kanban-plugin: board
---

## Column Name

- [ ] Card title #tag

%% kanban:settings
{"kanban-plugin":"board"}
%%
```
Columns: one per phase + a `✅ Done` column pre-populated with shipped features.

### After producing any Obsidian doc
- Update `[APP_NAME] Claude Commands.md` in the same vault folder
- Add the prompt pattern used to the relevant section so it can be reused
- Update frontmatter `created` date if refreshing an existing file
