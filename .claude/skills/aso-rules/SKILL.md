---
name: aso-rules
description: App Store Optimization rules — scoring system, field hierarchy, character limits, keyword-tier strategy, and verification checklist for iOS App Store and Google Play. Use whenever drafting or auditing app listing copy.
---

# ASO rules

Use this skill any time you produce or audit App Store / Google Play listing copy. These rules apply across every app, not a specific one.

## Scoring

- **Popularity** (1–10): estimated search volume. Higher = more searches.
- **Difficulty** (1–10): how hard to rank. Lower = less competition.
- **Opportunity** = Popularity − Difficulty. Higher is better.
- **Sweet spot**: Pop ≥ 6, Diff ≤ 4, Opp ≥ +2.

LLM-estimated scores are rough. Always validate with AppASO (free tier), AppFollow, or Sensor Tower before submitting.

## iOS App Store field hierarchy

| Field | Chars | Weight | Rule |
|---|---|---|---|
| App Name | 30 | Highest | Lead with primary keyword. Every word is indexed. |
| Subtitle | 30 | High | Cover keywords NOT in the name. No redundant words. |
| Keywords field | 100 | Medium | No spaces after commas. Never repeat words from name or subtitle. |

## Google Play field hierarchy

| Field | Chars | Weight |
|---|---|---|
| Title | 30 | Highest — use most of the 30 chars, not just the brand name |
| Short description | 80 | High — include primary keyword |
| Full description | 4000 | Medium — repeat key terms 3–5× naturally |

## Core rules

1. **No redundant words across fields.** If "timer" is in the name, drop it from subtitle and keyword field.
2. **Split compound brand names.** `WildFocus` = one indexed word. `Wild Focus` = two indexed words. Split if both halves carry search value.
3. **Subtitle = second keyword field, not a tagline.** Adds new non-overlapping keywords.
4. **Keyword field: no spaces after commas.** `study,work,adhd` not `study, work, adhd`.
5. **Avoid generic mega-terms.** "productivity", "focus" alone are Pop 9–10 / Diff 9–10 — impossible to rank for a new app.
6. **Niche combinations beat broad terms.** "ADHD timer" (Pop 6, Diff 3) beats "focus" (Pop 9, Diff 10) for a new app.

## Keyword tier strategy

| Tier | Strategy |
|---|---|
| Skip (high pop, high diff) | Only use if they appear naturally in name/subtitle |
| Prioritise (high pop, low diff) | Target these first for the keyword field |
| Niche differentiation (low pop, very low diff) | Fill keyword field, differentiate |

## Name / subtitle template

```
[Primary keyword] - [Brand Name]        ← iOS Name (≤ 30 chars)
[Niche A], [Niche B] & [Unique hook]    ← iOS Subtitle (≤ 30 chars)
keyword1,keyword2,keyword3,...          ← Keywords field (≤ 100 chars, no spaces)
```

## Verification commands

Run these before claiming any field is final:

```bash
echo -n "Your Subtitle Here" | wc -c        # must be ≤ 30
echo -n "your,keywords,here" | wc -c        # must be ≤ 100
```

## Pre-submit checklist

- [ ] No word repeated between name and subtitle
- [ ] No word in keyword field already appears in name or subtitle
- [ ] Brand name is split if both parts have search value
- [ ] Google Play title uses close to 30 chars
- [ ] Google Play short description includes the primary keyword
- [ ] Scores validated against AppASO / AppFollow / Sensor Tower (not just LLM estimates)
