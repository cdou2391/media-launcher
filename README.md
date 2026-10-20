# AURA Home Media

A touch-first Windows media launcher built with Tauri 2, Rust, Vite and vanilla JavaScript. The cinematic dashboard, favorites, search, accent colors, keyboard navigation, fullscreen toggle and explicit Exit to Windows remain available.

## Current development status — 2026-10-20

Phase 0 safeguards and Phase 1 application code are implemented. **The native x64 proof of concept passes automated WebView2 checks; physical Surface acceptance remains open.** Both native architectures compile, pass five Rust tests and produce installers in CI. No provider playback, physical touch/fullscreen or ARM64 runtime result is claimed.

- Versioned v2 shortcuts retain v1 favorites, custom targets, colors and marks. Migration keeps the original v1 key and a backup. Unreadable or future-version data is preserved; a visible notice explains session-only changes.
- Add or edit each shortcut's Auto / Inside AURA / External mode. Tiles show the chosen destination. Windows apps and media files always launch externally.
- Auto tries ordinary HTTP(S) websites in an AURA-owned native service window. Netflix, Disney+, Prime Video/Amazon and Spotify default to External because embedded authentication/protected playback has not been verified. Explicit Internal overrides show the compatibility limitation.
- Internal browsing uses stable WebviewWindow plus a separate local control window owned by the remote window. The control window contains **Return to AURA Home**, Retry and Open externally, with 48px buttons. Native close controls offer another return path. Ownership, fullscreen, rotation, DPI, task switching and touch still require Windows acceptance testing.
- Remote pages have no AURA command capabilities. Native commands independently check the caller's label, origin and route. Remote navigation to local asset/IPC origins, popups and downloads is blocked. No AURA scripts or credentials are injected into service pages.
- HTTPS is preferred. HTTP requires explicit consent per shortcut, including after v1 migration. Settings must not contain credentials. Normal website sessions are managed by WebView2; AURA does not copy browser cookies or bypass provider restrictions.

The browser preview explains that internal/native windows require the Windows app and offers an explicit external-tab fallback. It does not simulate successful native browsing.

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

Local checks pass: lint/format, 14 unit/configuration tests, the Vite build and 12 headless Chrome tests. Native CI on source commit 8569144 passes five Rust tests per architecture and creates both installers. The extracted x64 package passes real WebView2 HTTPS rendering, v1 migration, full-process persistence, eight remote IPC denials, popup/privileged-origin blocking, Retry, ten Home cycles, close requests and Exit. The local compiler still needs MSVC link.exe; testing used the CI-built executable. See [progress](docs/PROGRESS.md), [exact native evidence](docs/NATIVE_SMOKE_RESULT.json) and [hardware checklist](docs/PHASE_1_SPIKE.md).

## Build separate Windows installers

```powershell
rustup target add x86_64-pc-windows-msvc aarch64-pc-windows-msvc
npm ci
npm run tauri:build -- --target x86_64-pc-windows-msvc -- --locked
npm run tauri:build -- --target aarch64-pc-windows-msvc -- --locked
```

Installers are written under `src-tauri/target/<target>/release/bundle/nsis/`. ARM64 cross-compilation requires the ARM64 MSVC components. The Windows workflow uses independent x64 and ARM64 runners, runs frontend/Rust tests with locked dependencies, then builds the corresponding installers. [The validated CI run](https://github.com/cdou2391/media-launcher/actions/runs/39412058478) built both installers; artifact links and SHA256 values are recorded in docs/NATIVE_SMOKE_RESULT.json. Packaging is separate from install/uninstall or hardware acceptance.

## Use the proof of concept

1. Open All applications and edit a shortcut, or add `https://example.com` in Internal mode. For Jellyfin, enter your own server URL; explicitly allow HTTP if necessary. The default localhost:8096 entry requires that consent before launching.
2. In the native app, launch the shortcut. A remote service window and separate AURA controls should appear. Home hides only after both windows have been created.
3. Use Return to AURA Home to close the service and return to the Home view. Retry reloads the original shortcut. Open externally opens that same original URL in the default browser and restores Home.
4. A blocked popup, slow load, unsupported login or playback can use the visible external fallback. A page-finished event is not proof of successful login or playback. A failed window creation leaves Home available with an error and fallback dialog.
5. Exit using Settings → Exit launcher. AURA does not replace Explorer or enforce kiosk mode.

No automatic app discovery, Jellyfin/Plex synchronization, aggregated Continue Watching, built-in media playback or updater has been added. Phase 2 and later remain out of scope. The next release gate is native x64/ARM64 build verification followed by the physical touch/return-navigation and remote IPC negative tests in [the acceptance matrix](docs/ACCEPTANCE_TESTS.md).

## Reproduce the native smoke test

After building or extracting your architecture's executable from the CI installer:

```powershell
npm run test:native -- "D:\path\to\aura-home-media.exe"
```

This Windows-only test launches that executable with a unique WebView2 profile and a process-scoped local debug port, serves a controlled untrusted HTTP fixture, and checks actual IPC denials, lifecycle, migration, restart persistence and an HTTPS document. It closes its app processes and leaves result JSON/profile files under the ignored .tools directory. No installer, registry setting, global environment variable or existing browser profile is changed. It requires the installed WebView2 runtime and HTTPS access. A PASS is Windows automation evidence, not physical touch/fullscreen or media-playback validation.
