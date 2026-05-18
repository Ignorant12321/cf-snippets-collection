# IPTV UI Redesign Design

## Goal

Refine the IPTV homepage into a cleaner, more polished subscription console while keeping the existing static HTML plus Cloudflare Snippet architecture.

## Scope

- Restyle `iptv/iptv.html` with a more attractive, dense, tool-focused layout.
- Keep current behaviors: source tabs, favorites, search, copy, open, refresh, and M3U export.
- Add a quiet source attribution for `iptv-org/iptv` with the upstream playlist URL.
- Repack the updated HTML into `iptv/iptv-snippet.js`.
- Keep the Snippet below the 32KB Cloudflare limit.

## Design Direction

The page should feel like a refined broadcast control desk: compact, calm, and useful. Use a dark-first neutral surface with restrained cyan and amber accents, precise spacing, and improved card hierarchy. Avoid a marketing landing page, oversized hero, nested cards, decorative blobs, and single-hue purple/blue gradients.

## Layout

- Header: compact brand, host, source attribution, and JSON/M3U actions.
- Search strip: stronger primary working area with a search input, clear action button, status, endpoint hints, and subtle upstream note.
- Main area: two-column desktop layout with a narrow source/favorite rail and a larger results grid.
- Results: denser channel cards with stronger title hierarchy, stable logo cells, metadata chips, and clear action controls.
- Mobile: stack header, search, rail, and results without overlap or clipped button text.

## Testing

Use Node tests to assert the new attribution markup exists in both standalone HTML and rendered Snippet HTML. Run the IPTV test file and confirm the compressed Snippet still stays under 32KB.
