# AGENTS.md — Instructions for coding agents working on AURA

## Mission

Maintain and evolve **AURA Home Media**, a touch-first launcher for Windows Surface x64 and ARM64 devices. The user wants web links to open *inside the AURA application wherever genuinely compatible*, with a consistent Home/back journey and supported external fallback. This is a normal Windows application, not a kiosk or Explorer replacement.

## Read order

1. `CLAUDE_CODEX_START_HERE.md`
2. `IMPLEMENTATION_PLAN.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DECISIONS.md`
5. `docs/PROGRESS.md`
6. `docs/ACCEPTANCE_TESTS.md`
7. Actual source files (`src/main.js`, `src-tauri/src/lib.rs`, etc.)

## Highest priority

1. Preserve existing shortcuts/dashboard and ability to exit to Windows.
2. Secure Tauri local/remote boundaries and fix baseline CSP.
3. Implement internal AURA web viewing using a supported API, with a **visible touch-operable return-to-AURA control** and an honest fallback path.
4. Make Windows x64 and ARM64 builds independently reproducible.

Do not spend Phase 1 on Jellyfin sync, native Windows app discovery, UI rewrites, or unrelated refactors.

## Build constraints

- Keep **Tauri 2 + Rust + Vite + vanilla JavaScript** until a measured requirement warrants a framework migration.
- Target Windows 11 x64 and ARM64; use `x86_64-pc-windows-msvc` and `aarch64-pc-windows-msvc`.
- Use documented Tauri APIs. Prefer stable `WebviewWindow`; child webview creation uses an unstable feature and needs a documented experiment/decision.
- A remote webview is **untrusted**: never authorize remote URLs in Tauri capabilities, do not expose `open_target` or system commands, and do not inject AURA credentials/privileged JS into sites.
- No iframe-only or URL-bar spoofing approach as the main solution. Do not evade web `X-Frame-Options`, CSP, DRM, anti-bot or provider restrictions.
- Treat Netflix, Disney+, Prime Video and other DRM-restricted streaming services as external-by-default unless the exact experience is validated.
- No silent “works” statements after browser-only or simulated tests. The app needs Windows hardware verification.
- Keep security and privacy local-first. Credentials must not go into `localStorage`, bundled source, logs, or examples.
- UI must support touch, mouse, keyboard, high DPI, screen orientation change and explicit safe exit.

## Development procedure

- Inspect repository state first; identify pre-existing work without overriding it.
- Implement one checklist item/milestone at a time, keeping a working build.
- Add tests with behavior changes; run all checks available in the current environment.
- Record blockers and exact test environment instead of inventing successful builds.
- Update `docs/PROGRESS.md` and README after each milestone. Update `docs/DECISIONS.md` when choosing or rejecting an architectural option.
- Avoid unrelated dependencies and premature major redesigns.
- Keep security-sensitive validation on the Rust side, not just in JavaScript.
- If an official service does not support embedding, implement a respectful compatibility fallback.

## Build delivery — standing user instruction (2026-10-21)

After every successful Windows application build, commit and push its source and publish the exact built binaries as the next GitHub release in `cdou2391/media-launcher`. The user has authorized this ongoing delivery workflow; do not ask again for routine commit, push or release publication.

- Inspect existing tags/releases and choose the next unused version. Continue the current `v0.1.0-preview.N` sequence while delivering preview builds, unless the user requests a different version/release channel. Preserve existing releases and assets.
- Tag the exact build source commit. Include the standalone x64 EXE and architecture-specific installers that were actually built, plus SHA256 checksums, launch instructions and validation evidence.
- Run the relevant available checks, verify uploaded asset digests and public download links, and state actual results and remaining device/runtime gaps in the release notes. Do not publish a failed build or reuse older binaries as if they came from the new source.
- Return the new release link and direct EXE download in the handoff. Record delivery in README and docs/PROGRESS.md.
- This instruction applies to Windows executable/installer builds; documentation edits and frontend preview/check builds do not require creating a binary release.

## Required handoff format

In your completion message provide: **implemented**, **files changed**, **tests run and results**, **still blocked or unverified**, and **next recommended checklist item**. Do not claim features delivered just because they appear in a plan.
