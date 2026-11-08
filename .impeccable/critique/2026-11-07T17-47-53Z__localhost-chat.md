---
target: NEXA chat app
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "url:http://localhost:3000/chat"
timestamp: 2026-11-07T17-47-53Z
slug: localhost-chat
---
# NEXA chat critique

Method: dual-agent (A: Nielsen experience review · B: Impeccable detector, audit and Lighthouse).

Both assessments scored the build from before the pasted composer, sidebar, tabs and alerts. Scores predate the fixes of the same day and were not recalculated.

## Heuristics

| Heuristic | Score /4 |
| --- | --- |
| Visibility of status | 3 |
| Match with the real world | 3 |
| User control | 2 |
| Consistency | 3 |
| Error prevention | 2 |
| Recognition over recall | 3 |
| Flexibility | 3 |
| Aesthetic | 3 |
| Error recovery | 3 |
| Help | 2 |

Total 27/40. Technical audit 14/20, no P0.

## Design specificity

Not a template. The wire is a real signature. The rest of the shell is standard for its category.

## Fixed on the same day

Escape in Browse closing the wizard, palette running the wrong command, focus lost after menus and wizard steps, wizard focus on Save without testing, Continue missing from interrupted answers, toolbar on empty errors, reply announcements and speaker labels, menu and palette focus contrast, RTL paragraphs, radio group arrows, skip link, h1 and titles, spinners under reduced motion.

## Priority issues still open

- [P1] Retry, Edit and Regenerate silently delete later messages. Branch, or warn with undo.
- [P1] Relay offered only after a failed test, with "secure proxy" and "relay" both in use.
- [P2] Wire and "Connected" don't report failures.
- [P2] Model management one at a time, Add model has about 20 controls.
- [P2] 24 of 26 controls under 44px on a touch tablet: size by pointer, not width.
- [P2] Sidebar not virtualized: 1306 chats give 12,553 nodes.

## Minor

Usage line truncates on phones, 9 settings tabs without a scroll cue, "10242.5 MB", theme-color wrong on /, no unsaved draft warning, no help entry, 11px host label.

## Not verified

Real phone, real API keys, a screen reader, Core Web Vitals, and an independent review of the new composer, sidebar, tabs and alerts.

## Questions

Branch or warn on Retry and Edit; wire behaviour on failure; keep or repurpose thumbs in a product with no listener; which batch comes next.
