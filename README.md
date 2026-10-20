# AURA Home Media — Surface Windows Launcher (0.1.0)

A touch-first, distraction-free launcher for Windows tablets including Microsoft Surface Pro, Surface Go, and Surface Laptop families. One project, two native Windows build targets: Intel/AMD x64 and ARM64 (Microsoft SQ / Snapdragon).

## What works in this starter

- Responsive cinematic dashboard for large and small screens, portrait and landscape.
- Favorites and an editable app shortcut collection. Add HTTP(S) URLs or absolute Windows paths to `.exe`, `.lnk`, `.url`, and common media files.
- Opens configured URLs in the default browser and local apps through Windows ShellExecute in a Tauri build.
- Search, accent colors, live local clock, keyboard arrow navigation, fullscreen toggle, and safe exit to Windows.
- Local-only settings and shortcut persistence (WebView storage).
- Runs in a normal browser as a UI preview: URLs work; Windows executable paths require desktop build.

## Not implemented in v0.1.0

- No automatic Plex/Jellyfin continue-watching synchronization or media-server library aggregation.
- No automatic discovery of installed Windows apps.
- No built-in video playback, DRM service integrations, or brightness/battery/Wi-Fi controls.
- No auto-start toggle or automatic update mechanism. Windows startup integration can be configured outside AURA using a Start-menu shortcut and `shell:startup`.
- The default Jellyfin shortcut points to `http://localhost:8096`; change it to the address of your actual media server.

## Requirements

**For end users:** Windows 11 x64 or ARM64, Microsoft Edge WebView2 runtime (on most Windows 11 systems already available). Windows 10 compatibility is best-effort and should be verified separately. Not for Surface RT / Windows RT.

**For development:** Node.js 22+, npm, Rust stable, Visual Studio C++ build tools with Windows SDK, and Tauri prerequisites. ARM64 cross-builds on x64 machines require the Visual Studio ARM64 C++ build tools.

## Browser preview

```powershell
npm install
npm run dev
```

Open the displayed localhost URL in a browser. This previews the UI but cannot launch native executable paths.

## Local Windows app testing

```powershell
npm install
npm run tauri:dev
```

## Build installers

Intel / AMD 64-bit:

```powershell
rustup target add x86_64-pc-windows-msvc
npm run tauri:build -- --target x86_64-pc-windows-msvc
```

Windows ARM64 (Surface Pro X, Surface Pro 11 Snapdragon):

```powershell
rustup target add aarch64-pc-windows-msvc
npm run tauri:build -- --target aarch64-pc-windows-msvc
```

Look under `src-tauri/target/<target>/release/bundle/nsis/` for the installer.

## Automated GitHub build

Push the project to a GitHub repository and run **Actions → Build Windows installers → Run workflow**. The included pipeline creates two installer artifacts, one on a Windows x64 runner and one on a native Windows ARM64 runner. CI build success requires all dependencies and Tauri CLI versions to be compatible with the runner image.

**Note:** The `.exe` installers are not already present in this source bundle. This starter was authored and JavaScript-checked in a Linux environment, so Windows native compilation and device testing remain to be performed.

## Installation and startup

Install the correct architecture-specific setup executable, then find **AURA Home Media** in the Start menu. To launch at Windows sign-in, press `Win+R`, enter `shell:startup`, and add a shortcut to AURA. To return to Windows use **Settings → Exit launcher**; AURA does not replace Explorer or make kiosk restrictions.

## Security design

The Rust command only accepts HTTP(S) URLs or absolute Windows paths with a restricted file extension list, avoiding command-shell string concatenation. Users can add shortcuts to any local executable matching these rules, so use it as a personal launcher rather than a multi-user lockdown/kiosk product. Settings are stored locally, no account or analytics backend is included.

## Next development phases

1. Native app discovery via Start-menu shortcut enumeration and thumbnail extraction.
2. Jellyfin and Plex adapters for library discovery and continue watching, with optional credentials stored in Windows Credential Manager.
3. Profile layouts, hardware-adaptive touch controls, and Windows startup configuration.
4. Signed installers, release management, and automated update support.

---

## Implementation plan for Claude Code / Codex (2026-10-20)

This ZIP also includes a **development handoff package** describing how to evolve the current 0.1.0 starter into a unified, secure, touch-first media experience:

1. [`CLAUDE_CODEX_START_HERE.md`](CLAUDE_CODEX_START_HERE.md) — copyable agent prompt and next task.
2. [`AGENTS.md`](AGENTS.md) — coding agent rules and safe implementation constraints.
3. [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) — complete scope, phases, delivery/acceptance gates.
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — trust boundaries, routing, embedded webview design.
5. [`docs/DECISIONS.md`](docs/DECISIONS.md) — ADRs and trade-offs.
6. [`docs/ACCEPTANCE_TESTS.md`](docs/ACCEPTANCE_TESTS.md) — test scenarios and device matrix.
7. [`docs/PROGRESS.md`](docs/PROGRESS.md) — living phase/status tracker.

**Implementation status:** The new in-app webview experience is *planned, not implemented* in the supplied source. Websites still open in the default browser until Phase 1 is implemented. The existing GitHub Actions file describes builds but this delivery does not include or verify native installers.
