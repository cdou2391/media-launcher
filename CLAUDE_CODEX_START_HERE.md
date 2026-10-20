# AURA — Start Here (Claude Code / Codex)

## Paste this into Claude Code or Codex after extracting this project

> You are working in the AURA Home Media codebase. This is a Tauri 2 + Rust + Vite/JavaScript Windows media launcher that must support **x64 and ARM64 Surface models**. The user wants website shortcuts to open **inside AURA** whenever supported, while DRM-restricted services must retain a clear, honest external fallback.
>
> First read `AGENTS.md`, `IMPLEMENTATION_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/ACCEPTANCE_TESTS.md`, and the actual existing source. Do not assume planned features already exist.
>
> **Your immediate assignment is Phase 0 followed by Phase 1 only.** Verify and secure the existing project; add a versioned shortcut schema and per-shortcut launch modes (`auto`, `internal`, `external`); create the internal web browsing experience using stable Tauri `WebviewWindow` where possible; provide a reliable **touch-visible Return to AURA Home** control; implement compatible-service fallback and meaningful error handling. Keep remote web content isolated from all privileged native commands. Start with a small Windows proof of concept for the navigation/toolbar problem before implementing the broader UI.
>
> Preserve the dark cinematic design, favorites, custom shortcuts, responsiveness and Windows exit. Add tests for migration, launch routing, security isolation and core navigation. Do not use an iframe as a general browser replacement; do not bypass DRM, web security policies, or terms of service. Do not promise Netflix/Prime/Disney+ playback in WebView2. Avoid broad rewrites and unrelated scope.
>
> After each milestone run the available checks, update README and `docs/PROGRESS.md`, and tell me the exact changed files, actual test results, remaining blockers and recommended next step. Clearly distinguish browser-preview tests, Windows development tests, CI builds and physical Surface tests. When a Windows build cannot be run in your environment, produce code and a precise build procedure without claiming it passed.
>
> Proceed autonomously through the tasks that can be completed safely. If a dependency or Windows capability is unsupported, document the evidence and implement the best maintainable supported alternative. Start now with a short repository audit, Phase 0 checks, and the Phase 1 WebviewWindow return-navigation proof of concept.

## Compact follow-up prompt for later sessions

> Continue AURA development from `docs/PROGRESS.md` and the next unchecked milestone in `IMPLEMENTATION_PLAN.md`. Re-read `AGENTS.md` and the latest architecture decisions. Do not restart finished tasks. Run available checks, implement the next small cohesive batch, update progress and report evidence/blockers.

## What good Phase 1 looks like

1. Open a configured ordinary HTTPS website in an AURA-owned native webview window.
2. Always have an obvious, usable route back to AURA Home with **touch**.
3. Close/reopen service reliably; no inaccessible fullscreen window; offline error and external fallback.
4. A known DRM-restricted provider selects External under Auto (user can see why).
5. A remote website cannot invoke AURA's Rust system commands.
6. Favorite shortcuts/preferences survive v1→v2 migration and app restart.
7. Builds/tests pass wherever run, with Windows build/device results truthfully labeled.
