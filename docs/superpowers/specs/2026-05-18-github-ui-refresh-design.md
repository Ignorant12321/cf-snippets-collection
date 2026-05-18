# GitHub Proxy Home UI Refresh Design

## Goal

Refresh the `github` home page into a cleaner productivity console while preserving a restrained GitHub-flavored dark interface. The page should make the primary conversion workflow obvious: paste a GitHub-related URL, inspect the generated proxy URL, and open it.

## Design Direction

Use a "tool bench first, GitHub flavor second" approach:

- Keep the dark theme, crisp borders, monospace URL details, and small green/cyan accents.
- Reduce decorative weight so the UI feels faster, calmer, and more practical.
- Make the input, generated output, and open action the visual center of the page.
- Keep the current single-file HTML/CSS/JS structure and existing behavior.

## Layout

The page uses three major zones:

1. Header console
   - Compact title and status metadata in one horizontal control bar.
   - Statistics remain visible but quieter: entry host, base host, and whitelist count.

2. Conversion workspace
   - Main input/output form takes the largest area.
   - Example buttons sit close to the input as quick presets.
   - The generated proxy URL appears in a clear read-only output row.
   - The primary open button is visually distinct but not oversized.
   - Parse details move into a compact side panel with source host, proxy host, path, history count, mirror count, and protocol.

3. Work tabs
   - History, mirror recommendations, and whitelist stay in tabs.
   - History cards become denser and easier to scan.
   - Mirror cards and whitelist table keep the same data but use cleaner spacing.

## Visual Rules

- Background should be mostly flat dark with a subtle grid or texture.
- Avoid heavy gradients and large decorative blocks.
- Use one accent color for primary actions and a second accent only for generated URL/status details.
- Keep border radius at 8px or less.
- Use compact controls with stable heights so the layout does not shift while typing.
- Preserve readable Chinese labels and monospace treatment for URLs/domains.

## Responsive Behavior

- Desktop: two-column conversion workspace, with form on the left and parse summary on the right.
- Mobile: single-column stack, title/status first, then form, parse summary, and tabs.
- Buttons and URL fields must not overflow narrow screens.

## Non-Goals

- Do not change proxy behavior, whitelist data, mirror data, localStorage keys, or `/go` form behavior.
- Do not introduce external assets, build tooling, or a framework.
- Do not enlarge the Cloudflare snippet logic beyond what is necessary to embed the refreshed HTML.

## Acceptance Criteria

- The primary workflow is visually obvious within the first viewport.
- Existing examples, validation, generated URL, open actions, tabs, search, history, and clearing behavior still work.
- The page looks cleaner and more efficient than the current version while still feeling related to GitHub tooling.
- The layout is usable on desktop and mobile widths.
