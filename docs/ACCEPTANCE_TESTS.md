# Acceptance and Test Matrix

Record PASS / FAIL / BLOCKED / NOT RUN, build commit/hash, exact hardware/architecture, OS build, and date for each test. **Not run is not pass.** Do not claim device coverage based on a browser preview.

## P0 — Functional baseline

Pinned sidebar follow-up (2026-10-21): the regression reproduced the old sidebar at y=-1000 after document scrolling. All 28 Chrome tests PASS, including fixed navigation during Home/Applications/Settings scrolling at 1400 × 700, 620 × 470 and 360 × 800, independent favorites scrolling, no horizontal overflow, and unchanged 90px compact rail bounds on browser entry. [CI source 338c418](https://github.com/cdou2391/media-launcher/actions/runs/39598060196) PASS both installers, 22 Node/config tests, 28 browser tests and six Rust tests per target. [Exact x64 evidence](PINNED_SIDEBAR_NATIVE_RESULT.json) PASS eighteen scoped statements including real wheel-scroll bounds, navigation/security/Exit/restart. Full-suite attempts encountered a tiny restored viewport from the low-level helper (also reproduced in Preview 4) and desktop-focus timing limits. Final `--sidebar-only` explicitly excludes native foreground/minimized-duration and low-level restore checks; manual taskbar/fullscreen restore remains unverified. No full native-suite PASS is claimed. Physical Surface and ARM64 runtime remain NOT RUN.

Direct switching follow-up (2026-10-21): all 25 Chrome-preview tests PASS, including internal switches retaining the shell through a native-session gap with zero observed Home frames; delayed Home events; loader geometry at 620 × 470, configured accent and reduced motion; slow loading/refresh; close/create failure recovery; navigation during loading and queued during creation. [CI source 44e98c4](https://github.com/cdou2391/media-launcher/actions/runs/39514351039) PASS both installers, 22 Node/config tests, 25 browser tests and six Rust tests per target. [Exact new x64 native evidence](SWITCHING_NATIVE_RESULT.json) PASS nineteen statements, including deliberately held document completion, no Home flash over four favorite launches/switches, pending-load Home cancellation, wrong-session/premature reveal rejection, thirteen remote IPC denials and existing navigation/usage/restart checks. The loader-hidden wait initially used the default visible state; correcting the harness produced a complete PASS with the unchanged binary. Physical Surface and ARM64 runtime remain NOT RUN; no protected playback acceptance is claimed.

Sidebar favorites follow-up (2026-10-21): Chrome preview checks cover star/edit/restart synchronization, search independence, scrollable lists at 620 × 470 with navigation reachable, phone panel geometry/keyboard dismissal, active-session preservation, safe switching despite a delayed Home event, close-failure handling and external-mode routing (mock native). The [exact x64 EXE](FAVORITES_NATIVE_RESULT.json) independently PASS all sixteen native checks including four real favorite opens/switches, correct active highlight, active reselect preserving its session and full-process favorite persistence. [CI source 2a7bbb6](https://github.com/cdou2391/media-launcher/actions/runs/39508617678) passes 22 Node/config tests, 20 browser tests, six Rust tests per architecture and both installers. Physical Surface touch/DPI/rotation and ARM64 runtime remain NOT RUN.

Compact browser controls follow-up (2026-10-21): browser tests PASS the 56px header, 44px icon target, no visible URL/status paragraph or duplicate Home/External buttons, bounded refresh IPC, and sidebar return at the 620px minimum width. The [exact x64 EXE](COMPACT_BAR_NATIVE_RESULT.json) separately passes fourteen native check statements including actual 56px reserved site bounds, icon-only refresh, sidebar Home through repeated sessions/fullscreen, security and usage. [CI source 3449214](https://github.com/cdou2391/media-launcher/actions/runs/39505309257) builds both architectures and passes their Rust/frontend checks. Physical Surface touch/DPI/rotation and ARM64 runtime remain NOT RUN.

| Test                               | Expected result                                       | Status                                     |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| P0-01 Browser preview loads        | Home dashboard and shortcut tiles appear              | PASS — headless Chrome preview, 2026-10-20 |
| P0-02 Existing favorites preserved | Refresh/restart retains user edits                    | NOT RUN                                    |
| P0-03 Offline shell                | Home navigation works without network                 | NOT RUN                                    |
| P0-04 External URL shortcut        | Opens in system browser with current starter behavior | NOT RUN                                    |
| P0-05 Native app launch            | Valid local target opens on Windows                   | NOT RUN                                    |
| P0-06 Safe exit                    | User can close AURA and return to Windows             | NOT RUN                                    |
| P0-07 CSP & capabilities           | No unrestricted CSP or remote IPC privileges          | NOT RUN                                    |

## P1 — Unified in-app browsing

Retained sessions (ADR-012), 2026-10-22: browser-preview tests PASS Open apps listing/count/favorite indicators, Return by session ID without relaunch/count, explicit Close/failure recovery/focus and 620px/360px touch-control/no-overflow behavior. [Exact x64 evidence](OPEN_APPS_NATIVE_RESULT.json) PASS for retained document/session, URL/notes/scroll and paused local media position, no reload/extra count on return, six-app capacity without eviction, native mute read-back and successful fixture suspension callbacks, inactive/stale reveal denial, explicit Close and process cleanup. Both architecture CI builds PASS ten Rust tests and packaging. The first native media check did not await its initial seek; the corrected range/seek fixture passes against the exact unchanged EXE. Provider playback, automatic pause, playing-media background behavior, physical Surface touch/DPI/rotation/multi-monitor and ARM64 runtime remain NOT_RUN. A successful sleep request is not universal media pause or measured CPU/memory savings; UI discloses that muting alone can leave playback advancing. Earlier one-child close-on-switch expectations are superseded for normal Home/switching; explicit Close releases each child. Native duration/minimize/restore cases remain excluded from this scoped run.

| Test                      | Expected result                                               | Status  |
| ------------------------- | ------------------------------------------------------------- | ------- |
| P1-01 Internal HTTPS      | AURA-owned service window opens, without Edge process UI      | NOT RUN |
| P1-02 Visible Home button | Touch returns user to AURA Home from remote page              | NOT RUN |
| P1-03 Portrait + DPI      | Return affordance works after rotation and at 200% DPI        | NOT RUN |
| P1-04 Keyboard & mouse    | Reliable close/home route via keyboard/mouse                  | NOT RUN |
| P1-05 External mode       | Always opens configured default browser or official app       | NOT RUN |
| P1-06 Auto routing        | Known incompatible DRM services choose external default       | NOT RUN |
| P1-07 Error/offline       | Visible retry and/or external fallback                        | NOT RUN |
| P1-08 Session             | Expected login/session behavior documented per service        | NOT RUN |
| P1-09 Popup/OAuth         | No dead-end dialogs; supported popup or external path         | NOT RUN |
| P1-10 No remote IPC       | Remote site cannot invoke any local/privileged Tauri commands | NOT RUN |
| P1-11 URL safety          | javascript:/data:/file: launch targets rejected               | NOT RUN |
| P1-12 v1 migration        | Previous custom shortcuts/favorites preserved                 | NOT RUN |
| P1-13 Repeat lifetime     | Open/close/reopen multiple sites without process leaks/hangs  | NOT RUN |
| P1-14 Webview crash       | Returns safely to home; user gets usable error                | NOT RUN |

## P2–P5 — Media, UX, accessibility and security

| Test                       | Expected result                                                | Status  |
| -------------------------- | -------------------------------------------------------------- | ------- |
| P2-01 Start Menu discovery | Valid installed programs listed without launching them         | NOT RUN |
| P2-02 UWP/MSIX handling    | Supported app identities launch properly or report unsupported | NOT RUN |
| P3-01 Jellyfin             | Login, list library, resume supported item, logout             | NOT RUN |
| P3-02 Credential hygiene   | No plaintext tokens in localStorage/logs                       | NOT RUN |
| P4-01 Touch size           | All critical controls >=44 CSS px target                       | NOT RUN |
| P4-02 Orientation          | Surface 3:2 portrait/landscape layouts work                    | NOT RUN |
| P4-03 Keyboard-only        | Focus, Enter, Escape, arrows function in critical flows        | NOT RUN |
| P4-04 Reduced motion       | System motion preference respected                             | NOT RUN |
| P5-01 Malicious web page   | No access to native APIs or filesystem                         | NOT RUN |
| P5-02 Malformed settings   | App recovers without losing valid user data                    | NOT RUN |

## P6 — Device/build matrix

| Device class                     | OS     | Build             | Install/launch/uninstall | Media/webview tests |
| -------------------------------- | ------ | ----------------- | ------------------------ | ------------------- |
| Surface Pro / Go Intel x64       | Win 11 | x86_64 MSVC NSIS  | NOT RUN                  | NOT RUN             |
| Surface with AMD x64             | Win 11 | x86_64 MSVC NSIS  | NOT RUN                  | NOT RUN             |
| Surface Pro X Microsoft SQ ARM64 | Win 11 | aarch64 MSVC NSIS | NOT RUN                  | NOT RUN             |
| Surface Pro Snapdragon ARM64     | Win 11 | aarch64 MSVC NSIS | NOT RUN                  | NOT RUN             |
| Older supported Surface Win 10   | Win 10 | best-effort       | NOT RUN                  | NOT RUN             |

## Compatibility observations template

Fullscreen regression (ADR-011): [exact Preview 6 x64 evidence](FULLSCREEN_NATIVE_RESULT.json) PASS for four website HTML fullscreen enter/exit cycles from fullscreen AURA and two from windowed AURA with unchanged host mode/viewport; Settings still toggles the host. Remote `app_fullscreen` and generic window commands are denied (14 calls in total). The new host-state assertion fails against Preview 5; earlier bounds-only checks missed the exit bug. Repeat video exit via touch and Escape on physical Surface, then verify sidebar/Home, switching while a fullscreen element is active and multi-monitor/DPI. These physical/provider cases remain NOT_RUN; scoped native results exclude foreground duration and low-level minimize/restore.

```text
Service:
URL / app version:
Hardware / Windows / WebView2 version:
Launch mode:
Loads: PASS/FAIL
Login: PASS/FAIL/NOT TESTED
Playback: PASS/FAIL/NOT TESTED
Audio / fullscreen: PASS/FAIL/NOT TESTED
Return Home touch: PASS/FAIL
Popups and OAuth: PASS/FAIL/NOT APPLICABLE
External fallback: PASS/FAIL
Notes / screenshot / logs:
```

## Phase 0/1 automated evidence — 2026-10-20

These checks ran on a Windows x64 host in Node/headless Chrome; they are not native Tauri or physical Surface results. Earlier device rows above remain NOT RUN until hardware evidence exists.

| Coverage                                                 | Actual result                                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| P0-01 preview dashboard                                  | PASS in Chrome                                                                            |
| P0-02 favorites/settings persistence; P1-12 v1 migration | PASS in Node and Chrome fixtures; native profile restart NOT RUN                          |
| P0-03 offline shell                                      | PASS after initial preview load; native cold offline start NOT RUN                        |
| P0-06 exit                                               | PASS for preview guidance; native exit NOT RUN                                            |
| P0-07 CSP/capability configuration                       | PASS static config + production CSP browser test; native IPC enforcement NOT RUN          |
| P1-05/P1-06 launch-mode/provider decisions               | PASS Node tests; Rust tests and native launch NOT RUN                                     |
| P1-02/P1-03 Home controls                                | PASS browser button sizing and UI mock; Windows ownership/fullscreen/touch NOT RUN        |
| P1-07 retry/external fallback UI                         | PASS preview and mocked IPC; native offline/cert failure NOT RUN                          |
| P1-10 remote IPC                                         | Native negative test NOT RUN; procedure in PHASE_1_SPIKE.md                               |
| P1-11 target safety                                      | PASS JS tests; Rust unit tests written, execution blocked by missing MSVC linker          |
| P1-13 lifetime/P1-14 crash                               | Native tests NOT RUN; session cleanup code is not proof                                   |
| Build                                                    | Vite PASS, Rust formatting PASS; native cargo check/tauri:dev BLOCKED by missing link.exe |
| CI, installers and provider playback                     | NOT VERIFIED                                                                              |

Record actual native/device results using [the spike procedure](PHASE_1_SPIKE.md). No test in this delivery establishes Netflix, Prime Video, Disney+, Spotify, YouTube or Jellyfin playback compatibility.

## Native x64 follow-up — source 8569144

[Exact evidence](NATIVE_SMOKE_RESULT.json) and [successful dual-architecture CI](https://github.com/cdou2391/media-launcher/actions/runs/39412058478). This section supersedes earlier NOT RUN entries only for the precise automated cases below; physical device rows remain unchanged.

| Case                                                                             | New actual evidence                                                                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| P0-02 / P1-12                                                                    | PASS in real WebView2: v1 migration plus favorite, color, mark and accent survive full native process restart                         |
| P0-06                                                                            | PASS native Exit command closes x64 app                                                                                               |
| P0-07 / P1-10                                                                    | PASS native untrusted fixture: all eight tested IPC calls rejected by ACL                                                             |
| P1-01                                                                            | PASS ordinary HTTPS document inside AURA, HTTP 200 and rendered content                                                               |
| P1-02 / P1-13                                                                    | PASS automated Home restoration/focus through ten native cycles and both close-request paths; physical visibility/touch still NOT RUN |
| P1-07                                                                            | PASS popup/local-origin block warnings and Retry; no provider error or certificate bypass                                             |
| P1-11                                                                            | PASS JS checks, five native Rust tests per architecture and native local-origin block                                                 |
| CI and packaging                                                                 | PASS separate release NSIS installers for x64 and ARM64                                                                               |
| Physical x64/ARM64, ARM64 WebView2 runtime, provider playback, install/uninstall | NOT RUN                                                                                                                               |

## Integrated sidebar follow-up � ADR-008

The earlier native evidence covers the separate stable-window spike. The child-webview replacement must independently pass: single native AURA window with no floating toolbar; rail/header bounds during resize and site fullscreen; all four rail destinations restore the selected view; repeated session cleanup; original-target Retry/External; remote denial of launcher/window/webview/event commands despite sharing the native host; and persisted v1 migration. Current local evidence: 14 Node/config tests, 12 Chrome-preview tests, production Vite build and Rust formatting PASS. Both architecture CI builds pass six Rust tests and produce installers. [The x64 replacement native test](SIDEBAR_NATIVE_RESULT.json) passes all four sidebar destinations, ten sessions, site fullscreen bounds, HTTPS, Retry, 11 remote ACL denials and migration/restart persistence; physical touch/DPI/rotation, ARM64 runtime and provider playback remain NOT RUN.

## Local usage addition (ADR-009)

[Exact delivery evidence](USAGE_NATIVE_RESULT.json): 22 Node/config tests and 16 browser-preview tests PASS; both native architectures pass six Rust tests and package release installers. Real x64 WebView2 PASS: internal shortcut launch count and time while its remote document has focus; usage pause and clear/cancel; own-window minimize/restore with stable minimized totals; persisted totals/paused preference after full process restart; original settings retained; 12 remote IPC denials including usage_foreground. External launch counts and Unavailable duration labeling, failed-launch exclusion, corrupted-storage preservation and checkpoint behavior are also covered in Node/browser tests. Physical touch/DPI/rotation, sleep/lock, ARM64 runtime and external-duration measurement are not established by this evidence.

## App card redesign — 2026-10-22

Local checks PASS lint/format, 25 Node/config tests and production Vite build. All 38 Chrome browser tests PASS: in-card action/launch separation, native disclosure keyboard/Escape/outside dismissal/focus restoration, favorite persistence, offline bundled logos, custom PNG rasterization/persistence/reset and SVG rejection, responsive 44px controls/panel bounds at 1400/620/360px. Existing navigation, retained-session, security-CSP, usage and loader tests remain passing. Preview screenshots inspected. [Windows CI](https://github.com/cdou2391/media-launcher/actions/runs/39694300296) PASS both architectures with 25 Node/config tests, 38 browser tests, ten Rust tests and installer builds each. [Exact packaged x64 checks](CARDS_NATIVE_RESULT.json) PASS 22 scoped native statements, including new logo decoding and card-menu/upload/reset isolation. Preview 8 is published with verified asset hashes, source tag and public download. Physical Surface touch, ARM64 runtime, installers and provider playback remain NOT_RUN; native foreground-duration/minimize/restore remain excluded.
