# [APP_NAME] Design Standards

Design tokens live in the `:root` block at the top of `src/App.css`. Always use these tokens — never hardcode colours, radii, or shadows. The canonical values are also exported from `src/theme.ts` for TypeScript use.

Update `[APP_COLOR]` and `[APP_COLOR_DARK]` tokens after template setup to match your brand.

---

## Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg-page` | `#fafafa` | `#000000` | Page background |
| `--bg-card` | `#ffffff` | `#111111` | Card / row backgrounds |
| `--bg-hover` | `rgba(0,0,0,.04)` | `rgba(255,255,255,.06)` | Hover state overlay |
| `--text-primary` | `#111111` | `#f5f5f5` | Body text |
| `--text-secondary` | `#5a5a5a` | `#888888` | Supporting text |
| `--text-muted` | `#9a9a9a` | `#555555` | Labels, captions |
| `--brand-500` | `[APP_COLOR]` | `[APP_COLOR_DARK]` | Primary action / accent |
| `--brand-600` | darker shade | `[APP_COLOR]` | Hover on primary |
| `--brand-50` | `rgba(0,0,0,.06)` | `rgba(255,255,255,.08)` | Brand tint backgrounds |
| `--border-light` | `rgba(0,0,0,.07)` | `rgba(255,255,255,.08)` | Card / row borders |
| `--border-medium` | `rgba(0,0,0,.13)` | `rgba(255,255,255,.15)` | Emphasis borders |

Semantic colours (red, blue, orange) follow the same `--{color}-500` / `--{color}-50` pattern.

---

## Shape tokens

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `8px` | Badges, small pills |
| `--radius-md` | `12px` | Inner elements, icon containers |
| `--radius-lg` | `16px` | **Cards and rows** (standard surface) |
| `--radius-xl` | `20px` | Modals, bottom sheets |

---

## Shadow tokens

| Token | Use |
|---|---|
| `--shadow-card` | Default card / row elevation |
| `--shadow-card-hover` | Hovered card |
| `--shadow-elevated` | Modals, overlays |

---

## Spacing

| Context | Value |
|---|---|
| Tab pane padding | `16px` sides, `24px` bottom (`padding: 16px 16px 24px`) |
| App header padding | `10px 16px 8px` |
| Gap between sections | `20px` (`margin-bottom`) |
| Gap between rows | `6px` (`margin-bottom`) |

---

## Component standards

### Card (`.card`)
```css
background: var(--bg-card);
border: 1px solid var(--border-light);
border-radius: var(--radius-lg);
box-shadow: var(--shadow-card);
padding: 16px;
margin-bottom: 12px;
```

### Settings row (`.settings-row`)
```css
display: flex;
align-items: center;
gap: 12px;
padding: 13px 16px;
border-bottom: 1px solid var(--border-light);
```

### Buttons (`.btn`)
- **Primary** (`.btn-primary`): brand fill, white text — main CTA
- **Secondary** (`.btn-secondary`): card background, outlined — secondary action
- **Danger** (`.btn-danger`): red fill — destructive action
- **Ghost** (`.btn-ghost`): transparent, muted text — low-emphasis action
- **Small** (`.btn-sm`): add to any of the above for compact contexts

---

## Layout

- Max app width: `640px` (`.app-shell`)
- All tab content: full width within `.tab-pane`

---

## Transitions

| Token | Value | Use |
|---|---|---|
| `--transition-fast` | `0.15s ease` | Hover states, colour changes |
| `--transition-normal` | `0.2s ease` | Shadow, opacity changes |
