# Design Standards — [APP_NAME]

All visual values come from `src/theme/`. Never hardcode colours, spacing, or typography in components.

---

## Colours

Import from `src/theme/colors.ts`. Access via the `useTheme()` hook:

```tsx
const { colors } = useTheme();
// colors.background, colors.text, colors.accent, etc.
```

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `background` | #FFFFFF | #000000 | Screen background |
| `surface` | #F2F2F7 | #1C1C1E | Cards, inputs, secondary containers |
| `surfaceElevated` | #FFFFFF | #2C2C2E | Elevated cards, popovers |
| `text` | #000000 | #FFFFFF | Primary text |
| `textSecondary` | #6C6C70 | #AEAEB2 | Labels, subtitles |
| `textTertiary` | #AEAEB2 | #6C6C70 | Placeholder text, disabled |
| `border` | rgba(0,0,0,0.12) | rgba(255,255,255,0.12) | Dividers, card borders |
| `accent` | [APP_COLOR] | [APP_COLOR] | Buttons, links, active states |
| `danger` | #FF3B30 | #FF453A | Errors, destructive actions |
| `success` | #34C759 | #32D74B | Confirmations |
| `warning` | #FF9500 | #FF9F0A | Warnings |

---

## Spacing

Import from `src/theme/spacing.ts` as `Spacing`.

| Token | Value | Use |
|-------|-------|-----|
| `xs` | 4px | Tight gaps (e.g., icon-to-label) |
| `sm` | 8px | Inner element spacing |
| `md` | 12px | Default padding in compact areas |
| `lg` | 16px | Standard screen padding, card padding |
| `xl` | 20px | Between grouped sections |
| `xxl` | 24px | Between major sections |
| `xxxl` | 32px | Large vertical gaps |
| `section` | 40px | Top of screen padding |

---

## Border radius

Import as `Radius` from `src/theme/spacing.ts`.

| Token | Value | Use |
|-------|-------|-----|
| `sm` | 8px | Small chips, inputs |
| `md` | 12px | Buttons, toggles |
| `lg` | 16px | Cards |
| `xl` | 20px | Large modals, paywall cards |
| `full` | 9999px | Pills, badges, dot indicators |

---

## Typography

Import from `src/theme/typography.ts` as `FontSize`, `FontWeight`.

| Size token | Value | Use |
|-----------|-------|-----|
| `xs` | 11px | Badges, legal text |
| `sm` | 13px | Labels, secondary text |
| `md` | 15px | Body text |
| `lg` | 17px | Section titles, large body |
| `xl` | 20px | Screen titles |
| `xxl` | 24px | Page headings |
| `xxxl` | 28px | Large headings |
| `display` | 34px | Hero text (onboarding, paywall) |

| Weight token | Value |
|-------------|-------|
| `regular` | 400 |
| `medium` | 500 |
| `semibold` | 600 |
| `bold` | 700 |
| `heavy` | 800 |

---

## Icons

Use `lucide-react-native` (peer dep: `react-native-svg`, both installed).

```tsx
import { Home, Settings, ChevronRight } from "lucide-react-native";

const { colors } = useTheme();
<Home size={24} color={colors.text} />
```

| Context | Size | Color token |
|---------|------|-------------|
| Tab bar | 24 | `colors.text` / `colors.accent` |
| List row | 20 | `colors.textSecondary` |
| Button / inline | 16 | matches surrounding text color |
| Hero / empty state | 40–48 | `colors.accent` or `colors.textTertiary` |

Never hardcode icon sizes or colors — always use the table above and pull color from `useTheme()`.

---

## Shadows

Import as `Shadow` from `src/theme/spacing.ts`.

| Token | Use |
|-------|-----|
| `Shadow.card` | Standard cards |
| `Shadow.elevated` | Modals, dropdowns, paywall sheets |

---

## Components

### Screen
Wraps every top-level screen with `SafeAreaView`. Always use as the root element.

```tsx
<Screen edges={["top", "bottom"]}>
  {/* screen content */}
</Screen>
```

### Card
```tsx
<Card elevated={false}>{/* content */}</Card>
```

### Button
```tsx
<Button label="Primary" variant="primary" size="md" />
<Button label="Secondary" variant="secondary" />
<Button label="Ghost" variant="ghost" />
<Button label="Delete" variant="destructive" />
```

### TextInput
```tsx
<TextInput label="Email" placeholder="you@example.com" error="Invalid email" keyboardType="email-address" />
```

### Toggle
```tsx
<Toggle label="Analytics" description="Help improve the app." value={enabled} onValueChange={setEnabled} />
```

### Badge
```tsx
<Badge label="Most Popular" variant="accent" />
```

---

## Layout rules

- **Safe area insets**: always use `<Screen>` as the root element of every screen.
- **Scroll views**: `showsVerticalScrollIndicator={false}` on all scroll views.
- **Keyboard avoidance**: `KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}` on all form screens.
- **Flexbox first**: use `gap`, `flex`, `justifyContent`, `alignItems` before reaching for `position: absolute`.

---

## Do not

- Hardcode any colour, size, or spacing value outside `src/theme/`
- Use `position: "absolute"` for layout — prefer flexbox
- Mix `margin` and `gap` on the same container
- Add keyboard entry inside modals or bottom sheets (causes layout shifts on iOS)
