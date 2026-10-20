# AURA Development Progress

**Last updated:** 2026-10-20  
**Status:** Starter 0.1.0 provided; roadmap packaged; **new features NOT implemented**.

## Baseline inventory

- [x] Home dashboard with tiles/favorites and configuration dialog exists in starter.
- [x] Manual HTTP(S) and local Windows path shortcuts exist in starter.
- [x] Local preferences and responsive styles exist in starter.
- [x] Tauri Rust `open_target` command exists in starter (not re-tested on physical Windows device for this plan).
- [x] GitHub Actions x64/ARM64 Windows installer workflow exists in starter (not executed/verified for this plan).
- [ ] Internal webview implementation.
- [ ] Auto/Internal/External shortcut launch mode.
- [ ] Touch-visible return-to-AURA from third-party website.
- [ ] CSP and Tauri-capability hardening for embedding remote content.
- [ ] Automated installed Windows app discovery.
- [ ] Jellyfin or Plex API connection.
- [ ] Physical x64 and ARM64 device tests.

## Milestone tracker

| ID | Milestone | Status | Evidence |
|---|---|---|---|
| P0 | Baseline checks, security, lockfile and test harness | NOT STARTED | — |
| P1 | Working secure embedded service and return-to-Home UX | NOT STARTED | — |
| P2 | Windows app discovery and launch gallery | NOT STARTED | — |
| P3 | Jellyfin/Plex + local media library | NOT STARTED | — |
| P4 | Surface touch/startup refinements | NOT STARTED | — |
| P5 | Reliability/security release checks | NOT STARTED | — |
| P6 | Verified x64/ARM64 installers | NOT STARTED | — |

## Agent update instructions

After each cohesive work batch, update **date**, **milestone status**, **changed files**, **actual commands and results**, **device/test environment**, **blockers**, and **next actionable item**. If Windows was not available, do not mark Windows tests as passing.

## Next step

Begin with Phase 0 and then the Phase 1 minimal stable `WebviewWindow` spike. The touch-visible, reliable return-to-home mechanism is the most important unresolved design/engineering question.
