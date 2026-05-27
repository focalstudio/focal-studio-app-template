---
name: ui-ux-pro-max
description: "UI/UX design intelligence for web and mobile. Includes 50+ styles, 161 color palettes, 57 font pairings, 161 product types, 99 UX guidelines, and 25 chart types across 10 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui, and HTML/CSS). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, and check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, and mobile app. Elements: button, modal, navbar, sidebar, card, table, form, and chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, and flat design. Topics: color systems, accessibility, animation, layout, typography, font pairing, spacing, interaction states, shadow, and gradient."
---

# UI/UX Pro Max - Design Intelligence

Comprehensive design guide for web and mobile applications. Contains 50+ styles, 161 color palettes, 57 font pairings, 161 product types with reasoning rules, 99 UX guidelines, and 25 chart types across 10 technology stacks. Searchable database with priority-based recommendations.

## When to Apply

Use when the task involves **UI structure, visual design decisions, interaction patterns, or user experience quality control**.

### Must Use
- Designing new pages (Landing Page, Dashboard, Admin, SaaS, Mobile App)
- Creating or refactoring UI components (buttons, modals, forms, tables, charts)
- Choosing color schemes, typography systems, spacing standards, or layout systems
- Reviewing UI code for UX, accessibility, or visual consistency
- Implementing navigation structures, animations, or responsive behavior
- Making product-level design decisions (style, information hierarchy, brand expression)

### Skip
- Pure backend logic, API/database design, infrastructure, non-visual scripts

## Rule Categories by Priority

| Priority | Category | Impact | Key Checks | Anti-Patterns |
|----------|----------|--------|------------|---------------|
| 1 | Accessibility | CRITICAL | Contrast 4.5:1, Alt text, Keyboard nav, Aria-labels | Removing focus rings, Icon-only buttons without labels |
| 2 | Touch & Interaction | CRITICAL | Min 44×44px, 8px+ spacing, Loading feedback | Hover-only interactions, Instant state changes (0ms) |
| 3 | Performance | HIGH | WebP/AVIF, Lazy loading, Reserve space (CLS < 0.1) | Layout thrashing, Cumulative Layout Shift |
| 4 | Style Selection | HIGH | Match product type, Consistency, SVG icons (no emoji) | Mixing flat & skeuomorphic, Emoji as icons |
| 5 | Layout & Responsive | HIGH | Mobile-first, Viewport meta, No horizontal scroll | Fixed px containers, Disable zoom |
| 6 | Typography & Color | MEDIUM | Base 16px, Line-height 1.5, Semantic color tokens | Text < 12px body, Gray-on-gray, Raw hex in components |
| 7 | Animation | MEDIUM | Duration 150–300ms, Motion conveys meaning | Decorative-only animation, Animating width/height |
| 8 | Forms & Feedback | MEDIUM | Visible labels, Error near field, Progressive disclosure | Placeholder-only label, Errors only at top |
| 9 | Navigation Patterns | HIGH | Predictable back, Bottom nav ≤5, Deep linking | Overloaded nav, Broken back behavior |
| 10 | Charts & Data | LOW | Legends, Tooltips, Accessible colors | Color-only meaning |

## Key Rules by Category

### Accessibility (CRITICAL)
- Contrast 4.5:1 normal text, 3:1 large text
- Visible focus rings (2–4px) on all interactive elements
- aria-label for icon-only buttons; accessibilityLabel in native
- Tab order matches visual order; full keyboard support
- Support prefers-reduced-motion; support Dynamic Type scaling
- Don't convey info by color alone (add icon/text)

### Touch & Interaction (CRITICAL)
- Min 44×44pt (Apple) / 48×48dp (Material) touch targets
- 8px minimum gap between touch targets
- Visual feedback on press within 100ms (ripple/opacity/elevation)
- Disable button during async; show spinner or progress
- Keep primary touch targets away from notch, Dynamic Island, gesture bar
- Support platform standard gestures; don't block system gestures

### Performance (HIGH)
- WebP/AVIF images; declare width/height to prevent CLS
- font-display: swap to avoid invisible text (FOIT)
- Lazy load non-hero components; split code by route/feature
- Virtualize lists with 50+ items
- Keep per-frame work under ~16ms for 60fps
- Use skeleton screens for >1s operations (not blocking spinners)
- Debounce/throttle high-frequency events (scroll, resize, input)

### Style Selection (HIGH)
- Match style to product type; use one consistent style across all pages
- SVG icons only (Heroicons, Lucide) — no emojis as icons
- Respect platform idioms (iOS HIG vs Material Design)
- One primary CTA per screen; secondary actions visually subordinate
- Design light/dark variants together for consistency

### Layout & Responsive (HIGH)
- Mobile-first design; viewport meta never disables zoom
- Breakpoints: 375 / 768 / 1024 / 1440
- Min 16px body text on mobile (avoids iOS auto-zoom)
- No horizontal scroll; min-h-dvh over 100vh on mobile
- 4pt/8dp spacing system; define z-index scale

### Typography & Color (MEDIUM)
- Line-height 1.5–1.75 for body; 65–75 chars per line max
- Semantic color tokens — no raw hex in components
- Dark mode: desaturated/lighter tonal variants, not inverted
- Font weight hierarchy: Bold headings (600–700), Regular body (400)

### Animation (MEDIUM)
- 150–300ms for micro-interactions; ≤400ms complex transitions
- Use transform/opacity only; never animate width/height/top/left
- Ease-out for entering, ease-in for exiting
- Spring/physics curves for natural feel
- Exit animations ~60–70% of enter duration
- Animations must be interruptible; never block user input

### Forms & Feedback (MEDIUM)
- Visible label per input (never placeholder-only)
- Show error below the related field
- Validate on blur, not keystroke
- Confirm before destructive actions
- Multi-step flows show progress indicator; allow back navigation
- Error messages: state cause + how to fix

### Navigation Patterns (HIGH)
- Bottom navigation: max 5 items with labels + icons
- Back navigation: predictable, preserve scroll/state
- All key screens must support deep linking
- iOS: bottom Tab Bar for top-level nav (Apple HIG)
- Android: Top App Bar with navigation icon (Material Design)
- Modals must not be used for primary navigation flows

## How to Use (with CLI scripts)

If the `ui-ux-pro-max` scripts are available in the project:

```bash
# Generate full design system
python3 skills/ui-ux-pro-max/scripts/search.py "<product> <keywords>" --design-system -p "Project Name"

# Search a specific domain
python3 skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain>
# Domains: product, style, color, typography, chart, ux, react, web, google-fonts, landing, prompt

# Stack-specific guidelines
python3 skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack react-native
```

If scripts are not available, apply the rules in this file directly.

## Pre-Delivery Checklist

**Visual Quality**
- [ ] No emojis as icons (SVG only)
- [ ] Consistent icon family and style
- [ ] Semantic theme tokens used (no ad-hoc hex)

**Interaction**
- [ ] All tappable elements have pressed feedback
- [ ] Touch targets ≥44×44pt (iOS) / ≥48×48dp (Android)
- [ ] Micro-interaction timing 150–300ms
- [ ] Disabled states visually clear and non-interactive
- [ ] Screen reader focus order matches visual order

**Light/Dark Mode**
- [ ] Primary text contrast ≥4.5:1 in both modes
- [ ] Secondary text contrast ≥3:1 in both modes
- [ ] Both themes tested before delivery

**Layout**
- [ ] Safe areas respected (headers, tab bars, bottom CTAs)
- [ ] Scroll content not hidden behind fixed bars
- [ ] Verified on 375px small phone and landscape
- [ ] 4/8dp spacing rhythm maintained throughout
