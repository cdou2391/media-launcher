# AURA Home Media

A touch-first Windows media launcher built with Tauri 2, Rust, Vite and vanilla JavaScript. The cinematic dashboard, favorites, search, accent colors, keyboard navigation, fullscreen toggle and explicit Exit to Windows remain available.

## Current development status — 2026-10-21

Phase 0 safeguards and Phase 1 application code are implemented. **Compatible websites now open beside AURA's existing sidebar; the floating control window is removed.** Both native architectures build and pass six Rust tests in CI. The x64 child-webview executable passes real WebView2 automation, including all sidebar destinations, site fullscreen bounds and 11 remote IPC denials. Physical Surface touch/DPI/rotation, ARM64 runtime and provider login/playback remain unverified.

- Versioned v2 shortcuts retain v1 favorites, custom targets, colors and marks. Migration keeps the original v1 key and a backup. Unreadable or future-version data is preserved; a visible notice explains session-only changes.
- Add or edit each shortcut's Auto / Inside AURA / External mode. Tiles show the chosen destination. Windows apps and media files always launch externally.
- Auto tries ordinary HTTP(S) websites in an AURA-owned native service window. Netflix, Disney+, Prime Video/Amazon and Spotify default to External because embedded authentication/protected playback has not been verified. Explicit Internal overrides show the compatibility limitation.
- Internal browsing reserves AURA's persistent sidebar and a 56px local header with only the service name and a 44px refresh icon. The URL, status paragraph, duplicate Home and Open externally buttons are removed from the bar. Selecting Home, Applications, Library or Settings in the sidebar closes the website and opens that AURA view. Status remains available to screen readers; warnings highlight the refresh icon and appear in its tooltip. This uses a pinned Tauri 2.12.4 child webview experiment, explicitly enabled by Cargo feature `embedded-browser`; see ADR-008. Earlier native evidence is retained in [sidebar evidence](docs/SIDEBAR_NATIVE_RESULT.json); current compact-bar verification is tracked in [progress](docs/PROGRESS.md).
- Remote pages have no AURA command capabilities. Native commands independently check the caller's label, origin and route. Remote navigation to local asset/IPC origins, popups and downloads is blocked. No AURA scripts or credentials are injected into service pages.
- HTTPS is preferred. HTTP requires explicit consent per shortcut, including after v1 migration. Settings must not contain credentials. Normal website sessions are managed by WebView2; AURA does not copy browser cookies or bypass provider restrictions.

The browser preview explains that internal/native windows require the Windows app and offers an explicit external-tab fallback. It does not simulate successful native browsing.

## Favorites in the sidebar

Favorite shortcuts also appear in a separate sidebar group, using their existing color, symbol and a short name. The list scrolls within the rail so Home and Settings remain reachable in short windows. Favorites stay in sync with stars/edits and do not disappear when searching. The active internal shortcut is highlighted; selecting another favorite closes the previous website before launching through the same Auto/Internal/External policy. Selecting the current site keeps its session intact. Phone-sized previews use a star button and labeled panel above the bottom navigation. No favicon service or new storage schema is needed.

## Home banner

Download the updated Windows build from [AURA 0.1.0 Preview 2](https://github.com/cdou2391/media-launcher/releases/tag/v0.1.0-preview.2): standalone x64 AURA.exe, separate x64/ARM64 installers, checksums, launch instructions and build validation. It includes the 56px browser bar with only the service name and refresh icon. The preview tag points to the exact tested source commit 3449214; all six uploaded asset digests match the local files. [Compact-bar native evidence](docs/COMPACT_BAR_NATIVE_RESULT.json) records all fourteen native checks passing.

The Home banner uses a locally bundled cinematic actor/singer collage, with the gold A retained as a sharp HTML/CSS overlay. Narrow layouts show the full artwork above the headline and keep the A visible. See [artwork, generation prompt and dimensions](docs/BANNER_ARTWORK.md). [CI source 6280746](https://github.com/cdou2391/media-launcher/actions/runs/39437904384) builds both Windows installers. The exact delivered x64 EXE passes the embedded-image SHA256/visible-A check and the full native WebView2 smoke suite; see [banner build evidence and binary hashes](docs/BANNER_NATIVE_RESULT.json). AURA-Banner-Test beside the repository contains AURA.exe, separate x64/ARM64 installers, checksums and test results. ARM64 runtime and physical Surface checks remain open.

## Develop and verify

Install Node.js 22.13+ (or newer LTS), npm, Rust 1.99.1, Visual Studio C++ build tools with the Windows SDK, and WebView2. Use the x64/ARM64 C++ components matching your target. The checked-in toolchain file selects Rust; both dependency lockfiles are committed.

```powershell
npm ci
npm run check
npx playwright install chromium
npm run test:ui
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri:dev
```

For an existing Chrome installation, set `$env:PLAYWRIGHT_CHANNEL = 'chrome'` before the browser tests. `npm run dev` serves the UI preview at http://127.0.0.1:5173; that port is fixed to keep the native trusted-origin boundary precise. Stop the preview before starting `tauri:dev`.

Local checks pass: lint/format, 14 unit/configuration tests, the Vite build and 12 headless Chrome tests. [CI source 32e0a9c](https://github.com/cdou2391/media-launcher/actions/runs/39425973205) passes six Rust tests per architecture and creates both installers. The extracted x64 executable passes real WebView2 HTTPS rendering, v1 migration, full-process persistence, 11 remote ACL denials, popup/privileged-origin blocking, Retry, ten Home cycles, all four sidebar destinations, site fullscreen bounds and Exit. The local compiler still needs MSVC link.exe; testing used the CI-built executable. See [progress](docs/PROGRESS.md), [exact sidebar evidence](docs/SIDEBAR_NATIVE_RESULT.json) and [hardware checklist](docs/PHASE_1_SPIKE.md). The earlier [stable-window evidence](docs/NATIVE_SMOKE_RESULT.json) is retained as history.

## Release delivery

Standing user instruction: after every successful Windows application build, push its source and publish the exact binaries as the next GitHub release, without another confirmation. Continue sequential preview tags while this is a preview. Include the built executables/installers, checksums, launch instructions and actual validation results; verify uploaded digests and download links. Existing releases are retained. The full delivery rule is recorded in AGENTS.md.

## Build separate Windows installers

```powershell
rustup target add x86_64-pc-windows-msvc aarch64-pc-windows-msvc
npm ci
npm run tauri:build -- --target x86_64-pc-windows-msvc -- --locked
npm run tauri:build -- --target aarch64-pc-windows-msvc -- --locked
```

Installers are written under `src-tauri/target/<target>/release/bundle/nsis/`. ARM64 cross-compilation requires the ARM64 MSVC components. The Windows workflow uses independent x64 and ARM64 runners, runs frontend/Rust tests with locked dependencies, then builds the corresponding installers. [The validated sidebar CI run](https://github.com/cdou2391/media-launcher/actions/runs/39425973205) built both installers; artifact links and SHA256 values are recorded in docs/SIDEBAR_NATIVE_RESULT.json. Packaging is separate from install/uninstall or hardware acceptance.

## Use the proof of concept

1. Open All applications and edit a shortcut, or add `https://example.com` in Internal mode. For Jellyfin, enter your own server URL; explicitly allow HTTP if necessary. The default localhost:8096 entry requires that consent before launching.
2. In the native app, launch the shortcut. The website appears beside the existing sidebar, below AURA�s trusted browser controls. The dashboard stays in the same native window.
3. Use Home in the sidebar to close the service and return to Home. The refresh icon reloads the original shortcut, retaining Retry's existing behavior.
4. For a blocked popup, slow load or unsupported login/playback, return through the sidebar and edit the shortcut to External before reopening it. Known restricted services still default to External under Auto. A page-finished event is not proof of successful login or playback. A failed window creation leaves Home available with an error and fallback dialog.
5. Exit using Settings → Exit launcher. AURA does not replace Explorer or enforce kiosk mode.

No automatic app discovery, Jellyfin/Plex synchronization, aggregated Continue Watching, built-in media playback or updater has been added. Phase 2 and later remain out of scope. The next release gate is physical touch/DPI/rotation and ARM64 runtime verification, followed by provider compatibility checks in [the acceptance matrix](docs/ACCEPTANCE_TESTS.md).

## Reproduce the native smoke test

After building or extracting your architecture's executable from the CI installer:

```powershell
npm run test:native -- "D:\path\to\aura-home-media.exe"
```

This Windows-only test launches that executable with a unique WebView2 profile and a process-scoped local debug port, serves a controlled untrusted HTTP fixture, and checks actual IPC denials, lifecycle, migration, restart persistence and an HTTPS document. It closes its app processes and leaves result JSON/profile files under the ignored .tools directory. No installer, registry setting, global environment variable or existing browser profile is changed. It requires the installed WebView2 runtime and HTTPS access. A PASS is Windows automation evidence, not physical touch/fullscreen or media-playback validation.

## Sidebar browser experiment

Build normally to enable the `embedded-browser` Cargo feature. For an external-only build that avoids Tauri's unstable child API, use `npm run tauri:build -- --no-default-features -- --locked`; explicit Internal then reports that it is disabled and offers External. No remote webview receives a window-wide capability grant: permissions target only the bundled `main` webview, with native caller label/origin checks as a second boundary. Site login/playback limitations and DRM fallback policy are unchanged.

Run the native smoke test with normal Windows desktop permissions. The restricted agent tool sandbox prevented WebView2 startup in the first attempt; the same executable passed with normal desktop permissions. A failed sandbox launch is recorded separately from application/runtime failures.

## Usage in Settings

Settings now shows AURA foreground time, time in internal websites, launch counts and last launch per shortcut. Track usage is on by default, stays on this device, can be paused, and has a separate Clear history action with confirmation. Clearing usage keeps shortcuts, favorites and appearance preferences.

Only time inside AURA is measured. External applications/browser tabs have launch counts with duration marked Unavailable (external). Foreground time includes passive viewing and does not establish playback or active attention. Samples exclude background/minimized intervals and long timer/sleep gaps; restart never backfills closed-app time. A crash may lose the last five seconds. No URLs, page history, credentials or external app identities are collected. Corrupt/future history is preserved with tracking paused until explicit clear. Preview measurements apply to the preview, not the native app.

Validation for this addition: 22 Node/config tests, 16 preview tests, six Rust tests per architecture and both release installer builds PASS. The exact copied x64 EXE passes real WebView2 site timing with the remote page focused, native minimized-time exclusion/restore, launch counts, pause, clear/cancel, full-process usage persistence and 12 remote ACL denials. [Usage evidence and hashes](docs/USAGE_NATIVE_RESULT.json), [successful CI](https://github.com/cdou2391/media-launcher/actions/runs/39432224423). Tracking starts with this build and does not estimate earlier usage. Physical Surface touch/DPI/rotation, ARM64 runtime, sleep/lock and provider playback remain hardware checks.

The native smoke test also verifies usage and minimizes/restores only its own test window through a process/path-checked inline PowerShell helper. It never changes Windows execution policy or scans other app activity.
