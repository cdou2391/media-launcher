# AURA Home Media — Implementation Plan

**Project:** AURA Home Media, a unified entertainment launcher for Microsoft Surface and other Windows tablets  
**Document version:** 1.0 | **Prepared:** 2026-10-20  
**Starter app:** 0.1.0 (existing source in this repository)  
**Execution audience:** Claude Code, OpenAI Codex, or another coding agent  
**Target platforms:** Windows 11 x64 and Windows 11 ARM64, with Windows 10 best-effort only

> **Important:** This is a build plan, not a claim that the listed features already work. The supplied source is a runnable UI/application-shortcut *starter*. The embedded-service browser, service integrations, and production installers are future tasks. Do not report them as delivered until tested.

## 1. Product objective

Turn a Windows Surface tablet into a primarily media-focused appliance **without** replacing the Windows shell. On launch, users should see a beautiful, fast, touch-first dashboard. They can browse compatible web services **within the AURA app**, return reliably to AURA Home, launch compatible Windows-native applications, and eventually consume local/Jellyfin/Plex media with a consistent look and navigation model.

### Success measures

1. On supported devices, AURA starts into an immersive responsive interface, with a visible exit to Windows.
2. A configured website in *Internal* mode opens in an AURA-owned browser view/window, not a separate system browser, **when supported**.
3. Users always have a touch-accessible, tested route from an internal website back to AURA Home; mouse/keyboard navigation works too.
4. *Auto* mode chooses internal for validated services and external for known incompatible experiences. An explicit *External* mode remains available.
5. Remote website content cannot invoke privileged Tauri commands or read AURA local configuration, secrets, or Windows files.
6. Native x64 and ARM64 installer artifacts are built independently and install, launch, and uninstall cleanly.
7. No DRM circumvention, login scraping, or implied universal embedded access to commercial streaming platforms.

### Principles

- **Content-first, touch-first, minimal chrome.** Maintain existing dark cinematic visual language; large targets and generous spacing.
- **Native when possible; embedded where supported; external when necessary.** Do not sacrifice compatibility to maintain a cosmetic illusion.
- **Offline home always works.** Network services degrade clearly rather than blanking the launcher.
- **Windows remains accessible.** Avoid kiosk enforcement and irreversible shell changes.
- **Security is a release gate.** Untrusted web content is not privileged local application UI.
- **One source tree, two builds.** Independent Windows MSVC targets: `x86_64-pc-windows-msvc`, `aarch64-pc-windows-msvc`.

## 2. Existing repository baseline — inspect before editing

| Current path | Existing responsibility | Planned change |
|---|---|---|
| `src/main.js` | One-file UI state, shortcuts, launching, clock, focus navigation | Incrementally split into modules, add launch-mode routing, view lifecycle, persistence migration |
| `src/style.css` | Responsive dark theme, rail, tiles, dialog, keyboard focus | Add compact internal-browser affordances; orientation/high-DPI/keyboard refinements |
| `index.html` | Dashboard markup; add-shortcut dialog | Add launch-mode selection, compatibility disclosure, service-view UX when feasible |
| `src-tauri/src/lib.rs` | `open_target` Rust command delegates to Windows `ShellExecuteW` | Separate validated local app launch from webview creation/routing; add tests |
| `src-tauri/capabilities/default.json` | Window controls for `main` only | Least-privilege capabilities per **local** webview/window; no remote URL grants |
| `src-tauri/tauri.conf.json` | Tauri app/bootstrap and NSIS bundle | Replace `csp: null` with restrictive local CSP, review `withGlobalTauri: true` |
| `.github/workflows/windows-build.yml` | Builds architecture-specific Windows installers | Add validation gates, pin/build lockfile, verify artifacts, smoke test on hardware |
| `README.md` | Development and local build steps | Keep status and operator instructions current |

**Audit notes:** The starter currently sends configured HTTP(S) shortcuts to the default browser; there is no embedded webview manager, no app discovery, and no media-server integration. The HTML currently states that website shortcuts open externally, which must be updated only after working implementation. The starter stores preferences in `localStorage` and exposes `window.__TAURI__` to local UI through `withGlobalTauri: true`. The baseline CSP is `null`. Review and harden **before** embedding remote pages.

## 3. Technical architecture

### Foundation (preserve)

- **UI:** Vite + vanilla JavaScript/CSS for the first implementation. Avoid a framework migration unless tests or maintainability justify it. Introduce TypeScript incrementally if desired after behavior is stable.
- **Desktop:** Tauri 2 and a Rust backend targeting Windows x64/ARM64.
- **Rendering:** Microsoft Edge WebView2 runtime on Windows. Do not assume a full Edge browser feature/DRM parity.
- **Persistence:** Existing local settings migrate safely; use versioned JSON for lightweight preferences; later move richer metadata to SQLite if justified. Store secrets in Windows Credential Manager or an appropriate OS-secure store, **never raw localStorage**.

### Logical components

```text
AURA UI (trusted bundled assets, main window)
  |-- Home / Favorites / All Apps / Search / Settings
  |-- Shortcut Repository (versioned, locally persisted)
  |-- Launch Router (auto | internal | external)
  |-- Internal Browser Manager (dedicated webview window; remote/untrusted)
  |-- Media Integration Adapters (Jellyfin/Plex in later phases)
  +-- Native Bridge (narrow, validated, trusted UI only)
         |-- Local app launch + installed-app discovery
         |-- Secure persistence/credentials (later)
         +-- Optional system integration (startup, battery, etc.)

Remote site view/window (NO privileged AURA IPC)
  |-- HTTPS site browsing if compatible
  +-- Safe return-to-home UX through AURA-controlled chrome/close path

Fallback: external browser or native application when embedding is restricted
```

### Source boundaries proposed (refactor incrementally)

```text
src/
  main.js                       # Bootstraps current UI; reduces over time
  components/                  # Tiles, dialogs, UI state after refactor
  services/
    shortcuts.js                # Model, migration, CRUD and validation
    launch-router.js            # Routing decisions and compatibility policy
    internal-browser.js         # Native browser-view/window orchestration
    app-discovery.js            # UI-side native bridge wrapper (phase 2)
    service-catalog.js          # Provider metadata, not DRM bypass rules
  styles/                       # Optional split from style.css
src-tauri/src/
  lib.rs                        # Tauri builder and vetted commands
  launch.rs                     # Windows local targets only
  browser.rs                    # Browser window creation/control policy
  discovery.rs                  # Windows app discovery (phase 2)
docs/
  ARCHITECTURE.md
  ACCEPTANCE_TESTS.md
  PROGRESS.md
AGENTS.md
IMPLEMENTATION_PLAN.md
CLAUDE_CODEX_START_HERE.md
```

Paths are targets, not rigid upfront requirements. Preserve working features during migration; add modules only when work benefits.

## 4. In-app opening: hard constraints and solution

**Do not use an iframe as the default browser architecture.** Many services deny framing with CSP or `X-Frame-Options`; protected playback may fail even if the page renders. Do not intercept or circumvent these protections.

**Primary implementation:** Create an AURA-owned **Tauri `WebviewWindow`** for remote sites. This stable API supports a window with one webview and does not require Tauri's unstable child-webview creation feature. Label it per session/service. A separate Tauri window is still *inside the AURA application*, although it is not literally an HTML pane nested in the Home webview.

**Critical UX spike:** A remote `WebviewWindow` does not automatically provide an AURA-branded, trusted browser toolbar over the remote site. Implement and test a reliable, touch-visible *Return to AURA* control before declaring the in-app browsing feature complete. Evaluate a small, trusted AURA-controlled overlay/tool window, a native window-control strip, or another verified Windows-native arrangement. Test z-order, DPI, keyboard focus, fullscreen, rotation, and accessibility. If a visible toolbar cannot be implemented dependably with stable APIs, document that outcome and only then prototype Tauri child webviews behind the `unstable` feature. Do not silently depend on an unstable API.

**Do not fake unification:** Opening Edge fullscreen and hiding its taskbar is **External**, not **Internal**. Do not market it as embedded. When DRM or login compatibility requires a regular browser, communicate the change and provide a reasonable return path.

**Navigation requirements:** Home, close, optional reload, back/forward *where supported*, loading/error status, and a clear current-service indicator. Use documented webview/window APIs or explicit tested native browser hosting; never assume cross-origin JavaScript access or inject unsafe wrappers into provider sites.

**Compatibility matrix (validate on real hardware):**

| Source | Initial policy | Notes |
|---|---|---|
| General HTTPS websites | Internal when tested; Auto may try internal | Handle popup/auth flows, WebView2 restrictions, failures |
| YouTube | Internal for supported web/official player experiences; fallback | Do not assume every YouTube feature works embedded |
| Jellyfin (self-hosted) | Internal prototype, then native integration | Supports user-supplied server URL, LAN reachability checks |
| Plex | Internal prototype, then authorized native integration | Authentication and playback vary |
| Spotify | Auto validated per flow, otherwise External | Embedded SDK/provider restrictions apply |
| Netflix, Prime Video, Disney+ | External by default until verified | DRM and browser trust restrictions; do not promise in-app playback |
| Local files | Native media path or external registered player | File handling and codecs tested separately |

Never imply that this table guarantees streaming rights, HD/4K quality, or every provider login.

## 5. Shortcut & launch domain model

Migrate existing `aura-shortcuts-v1` safely, preserving favorites, colors and custom paths.

Proposed v2 record:

```json
{
  "id": "youtube",
  "title": "YouTube",
  "target": "https://www.youtube.com",
  "kind": "website",
  "category": "video",
  "launchMode": "auto",
  "favorite": true,
  "icon": null,
  "color": "#6d2630",
  "lastOpenedAt": null
}
```

Rules:

- `kind`: `website | windowsApp | mediaFile`; never guess based on display name.
- `launchMode`: `auto | internal | external`. **Internal** only applies to compatible websites or supported media surfaces. For local Windows apps, explain that launching inside AURA is generally impossible without app-specific integration.
- `auto`: policy-driven choice; external for known DRM-restricted providers; internal for explicitly verified sources; unknown sites may try internal with user-approved fallback.
- Distinguish a service/site's *home URL* from its stable ID. Validate scheme/host, prevent `javascript:`, `data:`, `file:` and shell pseudo-URL targets via URL fields.
- Prefer HTTPS. Plain HTTP can be enabled explicitly for localhost/private LAN self-hosted media servers (with warning); do not send credentials unencrypted without informing users.
- Canonical Windows executable and shortcut targets require validated absolute paths; supported application identity/AUMID handling must be explicit.
- Never auto-run unknown executables during discovery. Display icons/names first; launch only on user action.
- Changes must survive restarts and retain user edits. Migration cannot wipe existing shortcuts.

## 6. Phased work breakdown

Work sequentially unless a change is clearly independent. **Each phase must end in a passing build, tests, updated documentation, and a truthful status report.**

### Phase 0 — Baseline verification, safety and reproducibility [P0]

**Tasks**

- [ ] Clone/unzip; inspect every existing source file and list gaps against this plan.
- [ ] Run `npm install`, `npm run build`, and `npm run tauri:dev` on Windows. Record evidence and failures. Do not assert Windows tests were executed on Linux.
- [ ] Commit a dependency lockfile (`package-lock.json`), replace `npm install` in CI with `npm ci` once the lock exists; consider pinned Actions major versions.
- [ ] Add lint/format checks, JS unit tests (URL/target validation, schema migration, routing), and a minimum UI smoke-test approach.
- [ ] Remove unconditional `csp: null`; configure a deliberately restrictive CSP for bundled UI and only required origins/features. Verify resulting UI.
- [ ] Review `withGlobalTauri`; prefer imported APIs with minimal capability grants rather than global injection. Strictly scope privileged commands to trusted local main window/webview.
- [ ] Add `.gitignore`, safe error handling and user-friendly recoverability for corrupted local config.
- [ ] Preserve current design and working features; update the README to distinguish *implemented* from *planned*.

**Exit criteria**: Both UI development and native Windows app launch pass; app loads offline; tests/lint/build run cleanly; no unrestricted CSP; no privileged remote sources.

### Phase 1 — In-app service browser [P0; FIRST USER-VISIBLE MILESTONE]

**Tasks**

- [ ] Implement shortcut schema v2 and non-destructive migration from v1.
- [ ] Add launch-mode settings (Auto / Open inside AURA / Open externally) and explain restrictions in UI.
- [ ] Implement `LaunchRouter`, with per-service policy and explicit fallback reasons.
- [ ] Implement a stable Tauri `WebviewWindow` proof of concept for a safe test website and a configurable self-hosted media URL.
- [ ] Ensure remote windows have **zero** native command capabilities/privileged IPC; local Tauri permissions only for trusted bundled code. Verify isolation with a negative test.
- [ ] Build a touch-accessible Return Home / Close control using an AURA-owned trusted native UI technique. Test with keyboard, mouse and touch; avoid unreachable fullscreen windows.
- [ ] Define window ownership/lifecycle, one-vs-multiple tabs/views, focus restoration, crash handling, history/reload support where verified and feasible.
- [ ] Handle offline, site refused to render, popup/new-window, unsupported login flows, certificates, timeout and user-facing fallback.
- [ ] Update app-copy from “websites open in browser” to accurate mode-sensitive descriptions.
- [ ] Test YouTube, one ordinary website and Jellyfin demo/self-hosted instance where available; **do not state untested providers work**.

**Exit criteria**: Working desktop demo: launch general website inside an AURA-owned window; hit the visible touch Home control; land back at AURA without exiting the application; same shortcut can be set to External; no remote page can invoke local commands; user settings survive restart.

### Phase 2 — Installed Windows applications [P0]

**Tasks**

- [ ] Enumerate user/common Start Menu `.lnk` entries; handle broken links, duplicates, missing icons and install/uninstall refresh.
- [ ] Support verified packaged app identities (UWP/MSIX/AUMID) where possible, with user-readable fallbacks. Avoid requiring PowerShell at launch.
- [ ] Extract/display icons with safe caching and bounds; add optional manual path selection.
- [ ] Add App Library with category/search/favorite/reorder functionality and distinguish websites from native apps.
- [ ] Preserve manually added shortcuts and allow user override of metadata.

**Exit criteria**: On both architectures, user can browse detected apps, add one to Favorites, launch it and return to AURA. No automatic execution during scan.

### Phase 3 — Media integrations [P1]

**Tasks**

- [ ] Define adapter interfaces: `listLibraries`, `listRecentlyAdded`, `listContinueWatching`, `search`, `resolvePlayback` (each optional per provider).
- [ ] Integrate Jellyfin using **documented, authorized** API calls; support instance URL, login flow, libraries, thumbnails, Continue Watching and logout.
- [ ] Integrate Plex only via supported/authorized authentication and server APIs; handle disconnected/expired sessions.
- [ ] Build local media directory import and library browser; choose codecs/player pipeline based on tested Windows capabilities; allow external VLC/other player fallback.
- [ ] Design metadata cache with quota/eviction, offline placeholders and per-user isolation.
- [ ] Do not claim Continue Watching across Netflix/Prime/Disney+ unless an authorized provider API exists and integration is independently verified.

**Exit criteria**: At least one Jellyfin server (test fixture or actual instance) can securely authenticate, list real media, resume selected items with tested playback method, and log out. App remains functional offline.

### Phase 4 — Dedicated Surface tablet experience [P1]

**Tasks**

- [ ] Refine high-quality home, Recently Played, Favorites, app grid and service-specific pages. Preserve low-noise cinematic aesthetic.
- [ ] Support landscape, portrait, 125–250% scaling, touch, pen, mouse, keyboard and remote/gamepad-equivalent directional navigation where accessible.
- [ ] Minimum 44x44 CSS px touch targets (larger where practical); distinct focus rings; sensible motion-reduction support; contrast and screen-reader labels.
- [ ] Add safe optional launch-at-sign-in toggle, restore-to-fullscreen option, explicit Exit to Windows.
- [ ] Add session management, privacy choices, appearance preferences, and data export/import if time allows.
- [ ] Optional system info indicators (battery/time/network) only with necessary privileges and privacy safeguards.

**Exit criteria**: Surface user can navigate core flows entirely by touch; exit to Windows without obscure key combinations; UI doesn't break on 3:2 portrait/landscape screen, 200% scaling, or low-memory hardware.

### Phase 5 — Security and reliability [P1, release blocking]

**Tasks**

- [ ] Threat model untrusted websites, malicious deep links, custom shortcut values, LAN services, credentials, media metadata, logs and native IPC.
- [ ] Explicitly deny privileged APIs from remote webviews, and confirm Tauri capabilities are neither wildcarded nor merged accidentally.
- [ ] Enforce URL/path validation on Rust command boundaries independent of frontend checks; restrict navigation from local privileged views to approved local routes.
- [ ] Add credential storage in a secure Windows facility; no OAuth/session tokens in plain application settings or logs.
- [ ] Test DNS change, offline state, certificate errors, revoked login, malformed metadata, invalid `.lnk` and service crash.
- [ ] Audit external URL opening, browser popups, updates/dependency provenance, and installer signing if distributing broadly.
- [ ] Add minimal, privacy-respecting diagnostics; no analytics by default.

**Exit criteria**: Security checklist signed off with explicit negative tests; no known path from arbitrary web content to `open_target`, system commands, or file reads.

### Phase 6 — Windows distribution and release [P0 release gate]

**Tasks**

- [ ] Ensure GitHub Actions builds both target triples on verified runners. Current labels are `windows-2025` (x64) and `windows-11-vs2026-arm` (ARM64).
- [ ] Test `npm ci`, `npm run build`, Rust compile and NSIS packaging on separate runners; collect logs and installer SHA256 hashes.
- [ ] Validate clean install/uninstall and launch on Intel/AMD x64 and Snapdragon/SQ ARM64 physical devices; CI alone does not verify actual hardware behavior.
- [ ] Verify package architecture, WebView2 bootstrapper/offline requirements and upgrade behavior; consider MSI/MSIX separately only after NSIS is stable.
- [ ] Prepare code signing, version tags, changelog, release notes, migration and rollback guidance.
- [ ] Publish the two **distinct** installers with clear architecture labels and checksums.

**Exit criteria**: Both installers install and uninstall reliably on real devices, build provenance is retained, and user-facing notes accurately document provider compatibility/DRM limitations.

## 7. Acceptance tests and operational requirements

The full test matrix is maintained in `docs/ACCEPTANCE_TESTS.md`. These scenarios are mandatory for the earliest usable release:

- Website internal: navigate website → Back/Home visible → return to AURA, without launching Edge.
- External fallback: known DRM service opens in official application/browser where available, with clear indicator.
- Security: attempt to call privileged native APIs from untrusted page; request is denied.
- Migration: custom v1 shortcuts and favorites remain after update.
- Layout: both portrait/landscape Surface 3:2 ratio, mouse/keyboard/touch, high DPI.
- Offline: app dashboard and saved shortcuts remain usable; site errors offer Retry/Open Externally.
- Installer: native x64 and ARM64 binaries, normal uninstall, escape to Windows.

**Definition of done for each task:** code + tests + accessible UI where applicable + errors/fallback + docs updated + reproducible build. No fabricated test results.

## 8. Deliverable artifacts per phase

| Deliverable | Required by |
|---|---|
| Clean baseline with passing checks and unit tests | Phase 0 |
| Versioned shortcut schema, provider policy and migration | Phase 1 |
| Internal browser window and safe return navigation | Phase 1 |
| Browser capability/isolation tests | Phase 1 |
| Windows installed application picker | Phase 2 |
| Jellyfin adapter and sample integration tests | Phase 3 |
| Responsive touch accessibility verification | Phase 4 |
| Threat model + checklist evidence | Phase 5 |
| x64 `.exe` NSIS installer and build log | Phase 6 |
| ARM64 `.exe` NSIS installer and build log | Phase 6 |
| Release notes + checksums + known limitations | Phase 6 |

## 9. Risks, mitigations and explicit non-goals

| Risk | Mitigation |
|---|---|
| Protected content does not play in WebView2 | Compatibility table, Auto/External fallback, no DRM bypass |
| Some websites refuse frames or block non-standard browser contexts | Use top-level webview windows, not general-purpose iframes; test provider behavior |
| Remote window hides navigation chrome | Phase 1 UI spike and visible trusted return control as exit gate; prototype child webview only if justified |
| Tauri child-webview API stability | Prefer stable `WebviewWindow`; test and isolate experimental code behind feature flag |
| Security vulnerability from remote website context | Least-privilege capabilities, trusted/remote separation, negative IPC tests |
| OAuth/SSO and cookies fail in embedded context | Service-specific policy and external fallback; never steal browser cookies |
| ARM64 installer builds but runtime fails | Physical ARM64 testing, native MSVC target, checked CI logs |
| Old Surface performance | Lightweight frontend, thumbnail caching, minimal animations |
| Scope expansion | Get browser MVP done before media aggregation or auto-discovery polish |

**Non-goals for the initial release:** replacing Windows Explorer, bypassing commercial streaming DRM, automating Netflix/Prime watch history without APIs, mirroring arbitrary Windows applications inside AURA, or providing a security-hardened public kiosk.

## 10. Agent execution protocol

1. Read `AGENTS.md`, `CLAUDE_CODEX_START_HERE.md`, this plan, `docs/ARCHITECTURE.md`, and `docs/PROGRESS.md` **before changing source**.
2. Inspect current code and determine exact gaps. Prefer small, reviewable commits; keep existing UI working.
3. Complete Phase 0, then Phase 1 **before** moving to Phase 2+. Do not implement all phases at once.
4. If a technical approach is uncertain, run the smallest reproducible Windows spike and record evidence/decision in `docs/DECISIONS.md`.
5. After each milestone, update `docs/PROGRESS.md`, test matrix, README and current implementation status.
6. Never claim a passing Windows/Surface test without executing it on that platform; distinguish simulated/browser/CI/real-device evidence.
7. If work is blocked by permissions, credentials or unavailable hardware, implement what is independent and document the blocker clearly.
8. Use only legitimate documented APIs for third-party services. Respect ToS and DRM.
9. Every user-facing shortcut must identify where it will open; no silent external launches under an “internal” label.
10. For agent handoff, provide: changed files, decisions, how to run, passing/failing tests, known constraints and next checklist item.

## 11. Handy commands

```powershell
npm install
npm run dev
npm run build
npm run tauri:dev
rustup target add x86_64-pc-windows-msvc aarch64-pc-windows-msvc
npm run tauri:build -- --target x86_64-pc-windows-msvc
npm run tauri:build -- --target aarch64-pc-windows-msvc
```

The commands build locally on correctly provisioned Windows machines; ARM64 targeting may require ARM64 MSVC components. Native Windows installers cannot be verified from a browser-only preview.

## 12. Primary documentation (validate against installed library version)

- [Tauri 2 Webview API](https://v2.tauri.app/reference/javascript/api/namespacewebview/) — child webviews currently require `unstable`.
- [Tauri 2 WebviewWindow API](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/) — stable window with one webview.
- [Tauri 2 Capabilities](https://v2.tauri.app/security/capabilities/) — strict local vs remote permission boundaries.
- [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/) — NSIS/Windows targets.
- [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) — actual x64 and ARM64 runner labels.

When docs and source APIs differ, use the version installed in this repository, upgrade consciously and record why.
