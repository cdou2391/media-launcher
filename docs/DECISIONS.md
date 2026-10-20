# Architecture Decision Record (ADR)

## ADR-008 — Retain the AURA sidebar with an isolated child webview

**2026-10-21 controls follow-up:** At the user's request, the trusted header is reduced from 128px to 56px, containing only the service name and a 44px refresh icon. The persistent sidebar supplies the Home route. The URL, visible status paragraph and duplicate Home/External actions are removed from the header. Status remains in a visually hidden live region and warning tooltip; returning through the sidebar permits changing a shortcut to External. Native bounds and CSS must reserve the same 56px inset. This changes the controls within the existing child-webview architecture, not its isolation model.

**Status:** Implemented; x64 native automation and both CI builds PASS (2026-10-20); physical acceptance open. Supersedes ADR-005's floating controls.

The stable-window spike was built and exercised on Windows. The user's actual YouTube screenshot shows the separate owned control window obscuring a large portion of the site. The user requested AURA's existing side navigation while browsing. Separate top-level windows cannot deliver a shared native sidebar without brittle window positioning/overlays, so the stable spike has demonstrated a concrete UX deficiency.

Prototype one remote child webview in the existing main native window, reserving the existing 90px AURA rail and a compact 128px local browser header. Home, Applications, Library and Settings close the service and navigate within the same local UI. Remote content has no AURA capabilities. All ACL grants move from native window labels to the exact trusted `main` webview label; native commands inspect the invoking Webview's own label/URL, not its shared window. Main retains its navigation guard. No remote DOM injection or iframe is used.

Child creation uses Tauri's documented but unstable API, explicitly enabled through Cargo feature `embedded-browser` (default), with Tauri pinned to 2.12.4. Disabling default features disables internal browsing with an external fallback message. Creation remains in async commands. Native resize/DPI handling uses logical bounds, independent of remote page layout. Native open/close/retry operations serialize to avoid shared-label lifecycle races.

The [x64 native spike](SIDEBAR_NATIVE_RESULT.json) passes 11 remote ACL denials, blocked privileged-origin navigation, all sidebar destinations, ten sessions, site fullscreen bounds and restart persistence. Both architecture installers build and pass six Rust tests in CI. Actual DPI/rotation/multi-monitor resizing and touch hit-testing remain physical acceptance gates. CI builds and physical touch/rotation acceptance must be recorded separately. API evidence: installed tauri-2.12.4 `Window::add_child`, `Webview::set_bounds`, and `WebviewWindow` command conversion; [Tauri capabilities](https://v2.tauri.app/security/capabilities/).

## ADR-001 — Preserve Tauri 2 starter and dual-architecture Windows packaging

**Status:** Accepted (2026-10-20)

**Decision:** Maintain Vite + vanilla JS, Tauri 2, Rust, NSIS installers, Windows x64 + ARM64. Do not replace Windows shell. A React/TypeScript migration is not a prerequisite for Phase 1.

**Rationale:** The source already uses these components; incremental work has lower regression risk and supports relevant device architectures.

## ADR-002 — Prefer stable `WebviewWindow` for initial in-app browsing

**Status:** Accepted for proof-of-concept; persistent touch controls still to be validated (2026-10-20)

**Decision:** Build remote browsing first with Tauri's stable `WebviewWindow` API. Treat remote content as untrusted; no privileged Tauri capabilities. Only investigate child webviews after testing the return-to-Home UX under real Windows conditions.

**Rationale:** Child `Webview` creation currently requires unstable Tauri feature. HTML iframes cannot host arbitrary service sites reliably.

**Exit gate:** A touch-friendly native/Home return control works even when the site is fullscreen, focused and in portrait mode. If not, document experimental fallback and re-evaluate.

## ADR-003 — Explicit provider-aware launch routing

**Status:** Accepted (2026-10-20)

**Decision:** Shortcuts have Auto/Internal/External. Known DRM-restricted providers default External; the UI describes compatibility and limitations.

**Rationale:** WebView2 is not guaranteed to support streaming authentication and protected playback across providers.

## ADR-004 — No remote-to-native bridge

**Status:** Non-negotiable (2026-10-20)

**Decision:** Third-party origins are not granted Tauri capabilities, remote webviews cannot invoke launcher/system commands; use a strict local CSP and Rust-side validation.

**Rationale:** The launcher can open apps and later access local/media-server data. Giving native APIs to an arbitrary site creates a serious attack surface.

## ADR template for subsequent changes

- **Date / owner:**
- **Context / evidence:**
- **Decision / rejected alternatives:**
- **Security/UX impact:**
- **Tests:**
- **Follow-up:**

## ADR-005 — Stable owned control window is the first native spike

**Status:** Implemented; native x64 automation passes, physical acceptance open (2026-10-20).

The remote service is a stable WebviewWindow. A separate bundled browser-controls window is its native owner-child companion through WebviewWindowBuilder.parent. Tauri documents Windows owned-window z-order, minimize and lifetime behavior. This avoids a global topmost overlay and remote DOM/script injection. It does not prove Surface/fullscreen behavior. Controls use at least 48px actions, re-anchor on service monitor/DPI changes, and have a narrower tall layout. Closing either service window restores Home; a local event returns its actual view to Home.

Creation is performed from async commands because Tauri documents Windows deadlocks when creating webviews in synchronous commands/event handlers. A session ID prevents stale native callbacks from closing newer sessions. State locks are not held across native window calls. Home remains visible if creation fails. No unstable API is enabled until the [native spike](PHASE_1_SPIKE.md) records an actual deficiency.

References: [Tauri 2.12.4 WebviewWindowBuilder](https://docs.rs/tauri/2.12.4/tauri/webview/struct.WebviewWindowBuilder.html), [Windows owned windows](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features#owned-windows).

## ADR-006 — Local command ACL plus caller checks and explicit HTTP consent

**Status:** Implemented; eight live x64 remote IPC denials verified, physical repeat open (2026-10-20).

Register every application command in tauri-build's AppManifest and grant only specific allow-command permissions to exact local window labels. The remote service label is never granted a capability; no remote URL entries exist. Each native command separately checks caller label, local origin and local page path. Main/control navigation is pinned to its bundled route. Local CSP disallows frames, remote scripts, objects and remote network connections; development adds only the fixed Vite origin/WebSocket.

URLs use a real parser, reject credentials/control characters/native asset hosts and require explicit HTTP consent. Windows targets must be absolute, have a supported extension and exclude device namespaces, alternate data streams and relative traversal. Native routing independently enforces kind and launch mode. Both languages read the same exact-domain provider list. The toolbar can open only the original approved target externally and has no arbitrary-target launch permission. Configuration tests are not a replacement for native authority tests.

Reference: [Tauri AppManifest command permissions](https://docs.rs/tauri-build/2.7.3/tauri_build/struct.AppManifest.html#method.commands).

## ADR-007 — Conservative fallback and truthful load status

**Status:** Implemented with native acceptance pending (2026-10-20).

Auto tries ordinary websites internally, with compatibility visibly unverified; known restricted streaming/auth providers use External. Explicit Internal overrides do not change browser security or DRM behavior. Popups and downloads are denied, with an explicit external path from trusted controls. Retry and external opening use the original approved shortcut, not a page-provided URL. A native document-finished signal is labeled Page received rather than playback/login success. Status polling exposes a 20-second slow-load fallback. Back/forward and full renderer/error instrumentation remain follow-up work within Phase 1; no cross-origin evaluation is introduced to fake history access.

## Native validation follow-up — 2026-10-20

ADR-005/006 now have real x64 WebView2 automation evidence: HTTPS rendering, migration/process persistence, eight ACL denials, Home/lifetime/close/Exit and fallback-related checks pass. Both target architectures compile and package in CI. The first smoke test found that WebView2 can deliver load callbacks after cancellation; load status now preserves blocked warnings until trusted Retry/new session, with a native regression test. Physical owner-window/fullscreen/touch/DPI behavior and ARM64 runtime acceptance remain open, so the stable architecture stays a proof of concept. [Evidence](NATIVE_SMOKE_RESULT.json).

## ADR-009 - Local usage totals in Settings

**Status:** Implemented; both CI builds and exact x64 delivery executable validated (2026-10-20). Explicitly requested by the user as a Settings addition; no installed-app discovery or system-wide activity monitoring is added.

Track shortcut launch counts, last launch, foreground time in internal sites, and total AURA foreground time. Enable this local-only feature by default for the requested use, with a persistent Track usage switch and inline-confirmed Clear history action. Aggregate history uses versioned `aura-usage-v1` storage, separate from shortcuts/preferences. Persist only shortcut IDs/titles, counts, duration and the last-launch timestamp. Do not store targets, browsing history, credentials or a timeline, and make no network/analytics requests.

Use a narrow trusted-main-only `usage_foreground` command backed by Windows GetForegroundWindow/IsIconic. This compares only AURA's own native window; it does not enumerate other apps. The installed window-focus implementation uses thread-local GetActiveWindow, which is not an adequate foreground-app measurement. Internal browser status supplies its validated optional shortcut ID and generation so timing survives frontend reload without confusing shortcuts that have identical names/URLs. Remote pages receive no new capabilities and the new command is included in native ACL-denial checks.

The trusted UI samples once per second. Credit intervals only when both samples see AURA foreground and the same service session; exclude gaps over five seconds and discontinuous clocks. Persist every five seconds and on launch/pause/clear/explicit Exit/pagehide; a crash may lose the last few seconds. Restart creates a fresh monotonic baseline, never credits time while the app was closed, and no input-idle timer interrupts passive video viewing. These are approximate foreground durations, not attention or playback measurements.

External launch requests receive a count after successful native acknowledgement, but duration is explicitly Unavailable (external). AURA cannot reliably identify individual external browser tabs or when the user finishes a native app. Preview launches count explicit external-tab requests and preview durations apply to the focused preview only. Failed launches and Retry do not add launches; explicit External fallback is a separate launch. Pause stops all new counts/time without deleting history. Corrupt/future history is preserved and paused until explicit clear; write failures retain session totals with a visible notice.

References: [GetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow), [GetActiveWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getactivewindow).

ADR-009 validation: [exact usage result](USAGE_NATIVE_RESULT.json) records native child-focus timing, pause, clear/cancel, minimized-time exclusion/restore, process restart persistence and 12 remote command denials. Both installers pass CI. Physical Surface input/DPI/rotation, sleep/lock and ARM64 runtime remain open.

## ADR-010 - Direct service replacement with a trusted loading shell

**Date:** 2026-10-21. **Status:** Implemented; both CI builds and exact x64 native validation PASS. Physical acceptance remains open.

The user observed Home flashing between sidebar favorites because switching reused the full Home command. Internal launch now validates before closing, then replaces the single remote child under the same serialized native operation without emitting Home. External routes retain their explicit departure/dashboard behavior. A failed close keeps the old session; a failed create returns usable fallback controls. Local entry generations and an active transition ignore stale status/Home callbacks; a requested local destination during creation is honored when that operation completes.

Native child webviews render above local HTML, so a CSS overlay cannot safely hide their initial blank/loading frames. Use existing Tauri 2.12.4 APIs: create outside the visible client area, hide, apply normal bounds, then reveal through a narrow trusted-main-only command after its first document-finished signal. `browser_reveal` requires the exact current session and native `ready` flag, serializes with all browser mutations, and has no remote capability. This avoids a second service view, remote script injection or arbitrary URL navigation commands. A separate readiness flag preserves blocked warnings delivered before a finished/cancelled callback.

The loader uses existing accent variables and an A/orbit, has no fabricated percentage or forced delay, respects reduced motion, and stops motion with recovery guidance after the existing slow/blocked state. The app name is written as text. Document readiness is not provider playback acceptance. Browser tests cover lifecycle/race/failure/accessibility behavior; the native suite must independently validate actual child visibility, no Home flash, sidebar recovery, session guards and remote command denial.

[Native evidence](SWITCHING_NATIVE_RESULT.json) records nineteen passing statements for the exact CI-built x64 EXE, including deliberately held document completion, no Home flash, pending-load Home cancellation, premature/stale reveal rejection and thirteen remote IPC denials. Both architecture builds pass 22 Node/config, 25 preview and six Rust tests. Physical touch/DPI/rotation, ARM64 runtime and protected playback are not established by these results.
