# Updatebot Dashboard — Functionality

## Overview

The Updatebot Dashboard is a single-page web application that tracks Bugzilla bug reports filed by [Updatebot](https://github.com/mozilla-services/updatebot), an automated bot that monitors third-party library dependencies in Mozilla's codebase and files bugs when updates are available.

The dashboard fetches live data from the Bugzilla REST API and displays bugs grouped by library category, split into open and closed sections.

---

## Data Source

Bug data is fetched from the Bugzilla REST API (`bugzilla.mozilla.org`) on page load and on manual refresh. Only bugs filed by the reporter `update-bot@bmo.tld` across Mozilla's standard bug classifications (Client Software, Developer Infrastructure, Components, Server Software, Other) are included.

Two separate queries are made:

- **Open bugs**: resolution is `---` (unresolved)
- **Closed bugs**: resolution is `FIXED`, and optionally `DUPLICATE` (see Settings)

A `config.json` file controls the Bugzilla domain, URL templates, and library-to-category mappings. It also supports pointing queries at the Bugzilla test instance (`bugzilla-dev.allizom.org`) via the `use_test_domain` flag.

Query URLs are built using `URLSearchParams`, with shared parameters (reporter, classifications, included fields) defined once and reused across both queries.

---

## Bug Parsing

Each bug's summary line is parsed with one of four regex patterns to extract:

| Field | Description |
|---|---|
| Library | The third-party library being updated |
| Changeset | The version, tag, or commit hash being updated to |
| Date | The date of the upstream change (when available) |

Patterns handled:
1. `Update [LIB] to new version [REV] from [DATE]`
2. `Update [LIB] to new version [REV] for [release]`
3. `Examine [LIB] for N new commits, culminating in [HASH] [DATE]`
4. `Update [LIB] to new version [REV]`

Bugs that don't match any pattern are flagged in the error bar and categorized as Misc.

---

## Library Categories

Libraries are grouped into named categories defined in `config.json`:

| Category | Libraries |
|---|---|
| Image | jpeg-xl, libjxl, libwebp, libpng |
| Media | opus, libvpx, libyuv, dav1d |
| Graphics | webgpu, wgpu, angle |
| Layout | harfbuzz |
| MFBT | function2 |
| Javascript | irregexp |
| WebRTC | libepoxy, libsrtp, libdrm, libgbm |
| Misc | Any library not matched above |

Only categories that have at least one bug are displayed.

---

## Display

### Open Updates

Bugs with an open (unresolved) status are listed under **Open Updates**. All open bugs are always shown. Within each category, bugs are sorted by date descending (most recent first).

Each row displays:

| Column | Content |
|---|---|
| Date | Date of the upstream change (or bug creation date) |
| Library | Third-party library name |
| Bug | Bugzilla bug number (links to the bug) |
| Changeset | Version or commit hash |
| Owner | Shortened Bugzilla assignee name |

### Closed Updates

Bugs with a resolved status are listed under **Closed Updates** at reduced opacity to visually de-emphasize them. The columns are the same as Open Updates, with an optional Resolution column (see Settings).

To keep the page manageable, closed bug categories with more than 3 entries are collapsed by default:
- The 3 most recent entries are shown.
- A **Show more** button appears below them.
- Clicking **Show more** reveals all remaining entries and a **Show less** button at the bottom.
- Clicking **Show less** collapses the list back to 3 entries.

Categories with 3 or fewer closed bugs are always fully displayed with no button.

---

## Settings

The Settings panel (top right) allows per-user configuration stored in `sessionStorage` or `localStorage`.

| Setting | Description |
|---|---|
| **API Key** | A Bugzilla REST API key. Required to avoid rate limiting. Without one, a red alert icon appears next to the Settings button. See the [Bugzilla REST API docs](https://wiki.mozilla.org/Bugzilla:REST_API#with_two_factor_authentication) for how to obtain a key. |
| **Target same tab for bug links** | When enabled, bug links open in a named tab (`nidetails`) instead of a new tab each time. |
| **Always remember my settings** | When enabled, settings are saved to `localStorage` and persist across browser sessions. When disabled, settings are saved to `sessionStorage` and are lost when the tab is closed. |
| **Display Duplicates** | When enabled, bugs resolved as `DUPLICATE` are included in the Closed Updates list. A Resolution column is added to closed bug rows showing `FIXED` or `DUPLICATE`. |

Settings take effect immediately on clicking **Apply**, which triggers a full data refresh.

---

## Controls

- **Refresh** — Re-fetches all bug data from Bugzilla without reloading the page.
- **Settings** — Opens the settings panel.
- **Open Updates** title — Links to the equivalent Bugzilla search query for open update bugs.
- **Closed Updates** title — Links to the equivalent Bugzilla search query for closed update bugs.

---

## Error Reporting

Parsing errors and API errors are displayed in a red bar below the bug lists. Each unique error message is shown once. Common causes:

- Missing or invalid API key (Bugzilla may rate-limit or reject the request)
- A bug summary that doesn't match any known pattern

---

## File Structure

```
index.html        — Page structure and settings form
config.json       — Bugzilla URLs, domain config, and library categories
js/ubdash.js      — Main application logic (data fetching, parsing, rendering)
js/utils.js       — Shared utilities (settings, storage, sorting, domain handling)
css/ubdash.css    — All styling
images/           — Favicon, Firefox logo, alert and info icons
fonts/            — MozTT-Medium custom font
```
