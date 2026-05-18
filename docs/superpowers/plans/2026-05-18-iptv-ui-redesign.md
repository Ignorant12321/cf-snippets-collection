# IPTV UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the IPTV homepage into a polished subscription console and add quiet `iptv-org/iptv` source attribution.

**Architecture:** Keep the current standalone HTML as the source of truth, then replace the gzip/base64 homepage template inside `iptv-snippet.js`. Existing frontend behavior remains inline in `iptv.html`.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Cloudflare Snippet runtime APIs, Node test runner.

---

### Task 1: Attribution Test

**Files:**
- Modify: `test/iptv-snippet.test.mjs`

- [ ] **Step 1: Write the failing test**

Add assertions that rendered Snippet HTML and standalone HTML include `data-upstream-source`, `iptv-org/iptv`, and `https://iptv-org.github.io/iptv/index.m3u`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/iptv-snippet.test.mjs`

Expected: FAIL because the attribution marker is missing.

### Task 2: HTML/CSS Redesign

**Files:**
- Modify: `iptv/iptv.html`

- [ ] **Step 1: Update the page structure**

Keep all existing IDs and data attributes used by JavaScript and tests. Add a subtle attribution element with `data-upstream-source`.

- [ ] **Step 2: Replace the visual system**

Rewrite CSS for a dark-first, compact console layout with responsive mobile stacking, stable card dimensions, and no overlapping text.

- [ ] **Step 3: Run the focused test**

Run: `node --test test/iptv-snippet.test.mjs`

Expected: standalone HTML assertions pass, rendered Snippet attribution still fails until the template is repacked.

### Task 3: Repack Snippet Template

**Files:**
- Modify: `iptv/iptv-snippet.js`

- [ ] **Step 1: Compress the updated HTML**

Use a local Node script to gzip `iptv/iptv.html` and replace `HOME_HTML_GZIP_BASE64` in `iptv/iptv-snippet.js`.

- [ ] **Step 2: Run IPTV verification**

Run: `node --test test/iptv-snippet.test.mjs`

Expected: all IPTV tests pass and the Snippet remains below 32KB.
