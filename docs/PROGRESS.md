# AURA Development Progress

**Last updated:** 2026-10-20. **Scope:** Phase 0 then Phase 1 only.

Phase 0 safeguards and Phase 1 application code are implemented. Both architectures build and pass Rust tests in CI; the x64 package passes real WebView2 automation. Phase exit gates remain OPEN for physical touch/fullscreen/DPI/rotation, ARM64 runtime, provider login/playback and remaining baseline local-file/app launch checks. No Phase 2+ feature was added.

## Persistent sidebar follow-up � implemented and x64 runtime validated

The user's Windows screenshot showed the floating return panel obscuring YouTube. ADR-008 records that stable-spike deficiency and the explicit `embedded-browser` child-webview experiment, pinned to Tauri 2.12.4. The remote child reserves the existing 90px sidebar and 128px trusted header in the main window. All four rail destinations close the service and open the chosen AURA view. The former browser.html, controls JS/CSS and controls capability are removed. Native command checks inspect the invoking Webview and grants target only the exact local `main` webview, never the shared window. Native mutations serialize; resize/DPI bounds preserve chrome.

**Source/binary:** 32e0a9ccf79564f85e6f360a2a6522903ae24727; [successful CI](https://github.com/cdou2391/media-launcher/actions/runs/39425973205), [exact native evidence and hashes](SIDEBAR_NATIVE_RESULT.json). Final follow-up source changes are test/documentation only; native/build inputs match this tested commit. The proposed resize callback change was withdrawn after normal-permission testing established that the first startup failure was confined to the restricted tool environment, including with the earlier stable executable.

**Actual checks:** lint/format, 14 Node tests, production Vite build and Rust formatting PASS locally; 12 Chrome-preview tests PASS locally and on both CI runners; six Rust tests plus release NSIS packaging PASS independently on x64 and ARM64. Real x64 Windows 10.0.26200 / WebView2 155.0.4283.62 PASS: HTTPS 200/rendered document, v1 migration and full process restart persistence, 11 remote IPC ACL denials, popup/privileged-origin block warnings, original-target Retry, ten child-view Home cycles, all four rail destinations without delayed-event navigation errors, reserved native bounds during a site's actual fullscreen request, and Exit. No floating control window is created (one local and one remote WebView2 page per session).

**Environment limit:** the initial native attempt inside the restricted tool sandbox could not initialize the local WebView2 target. The same installer/executable passes with normal desktop permissions and an isolated profile. No production code fix is claimed for that environment failure.

**Exact changed files:** README.md; index.html; vite.config.js; src/main.js; src/style.css; src-tauri/Cargo.toml; src-tauri/capabilities/default.json; src-tauri/src/browser.rs; src-tauri/src/lib.rs; src-tauri/src/security.rs; tests/native-smoke.mjs; tests/security-config.test.js; tests/ui/controls.spec.js; tests/ui/csp.spec.js; tests/ui/home.spec.js; docs/ARCHITECTURE.md; docs/DECISIONS.md; docs/PROGRESS.md; docs/ACCEPTANCE_TESTS.md; docs/PHASE_1_SPIKE.md; docs/SIDEBAR_NATIVE_RESULT.json. Deleted: browser.html; src/browser-controls.js; src/browser-controls.css; src-tauri/capabilities/browser-controls.json.

**Delivery:** the separate AURA-Sidebar-Test folder beside this repository contains a verified x64 standalone AURA.exe, optional x64 installer, separate ARM64 installer, checksums and START-HERE.txt. The previous AURA-Test-Build folder is retained. No installer was run or personal profile modified by native automation.

**Still open / next:** physical Surface touch hit-testing while the remote child has focus/fullscreen, real DPI/rotation/multi-monitor changes, ARM64 app runtime, provider login/playback, normal local app/media launch and installer install/uninstall. Native DOM visibility and bounds assertions do not establish physical touch/z-order acceptance. Complete those Phase 1 gates before Phase 2.

## Implemented

- Dependency lockfiles, pinned JS dependencies and Rust toolchain, ESLint/Prettier, Node tests, Playwright preview tests and separate Windows x64/ARM64 CI checks.
- Restrictive local CSP; imported Tauri APIs; explicit command ACL per local window; native caller-origin/label/route and URL/path checks; remote origins never granted capabilities.
- Versioned v2 shortcuts with v1 backup and migration, favorites/display preservation, safe empty collections and visible session-only recovery when storage is unreadable/unavailable.
- Add/edit Auto/Internal/External modes and HTTP consent. Shared provider-domain policy drives both JS display and Rust enforcement. Known restricted services default to External in Auto.
- Stable remote WebviewWindow plus owned, trusted Home/Retry/External controls. One service session, guarded lifecycle cleanup, Home restoration/focus, blocked unsafe navigation/popups/downloads, slow-load messaging and explicit fallback.
- Browser preview states the native limitation instead of representing an external tab as internal browsing.

## Actual evidence

Local host: Windows x64 build 10.0.26200, Node 24.19.0, isolated Rust 1.99.1, headless Chrome, WebView2 155.0.4283.62. No physical Surface interaction. The local native compiler is blocked by missing MSVC link.exe, so the packaged x64 executable was extracted from the CI installer and tested without installation, using isolated WebView2 data.

Source commit: 8569144e0a561ca870dd693fd9ab2c2b7d9385bf. [CI run](https://github.com/cdou2391/media-launcher/actions/runs/39412058478) completed successfully on independent Windows x64 and ARM64 runners.

| Check                                                      | Actual result                | Scope                                                                                      |
| ---------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| npm run check                                              | PASS                         | ESLint, Prettier, 14 Node/config tests and both Vite entry points                          |
| npm run test:ui                                            | PASS, 12 tests               | Chrome preview, production CSP, storage/editing/navigation and explicitly mocked IPC cases |
| cargo fmt and locked manifest/graph                        | PASS                         | Local syntax/format/lock checks                                                            |
| Native Rust tests in CI                                    | PASS, 5 on each architecture | x86_64-pc-windows-msvc and aarch64-pc-windows-msvc                                         |
| Native release installers in CI                            | PASS, both architectures     | Separate NSIS artifacts, hashes in NATIVE_SMOKE_RESULT.json                                |
| Extracted x64 executable startup/HTTPS                     | PASS                         | Real WebView2, https://example.com response 200 and rendered document                      |
| Remote IPC isolation                                       | PASS, 8 native ACL denials   | Controlled untrusted HTTP fixture; no privileged command succeeded                         |
| Popup/local-origin navigation and Retry                    | PASS                         | Native blocked statuses remain visible; Retry reissues original request                    |
| Native lifecycle                                           | PASS                         | Ten service/Home cycles, both service/control close requests and Exit                      |
| Native migration/persistence                               | PASS                         | v1 favorite, color, mark, accent retained through reload and full app-process restart      |
| Physical Surface, ARM64 runtime, provider playback         | NOT RUN                      | Still release/acceptance gates                                                             |
| Installer install/uninstall, native local app/media launch | NOT RUN                      | Builds are not installer or baseline launch acceptance                                     |

The first native run exposed a real WebView2 event-ordering issue: cancelled load events overwrote blocked-navigation warnings. The final code preserves those warnings until a trusted Retry/new session and includes a Rust regression test. An HTTPS assertion also assumed an obsolete page heading; it now verifies the actual response and rendered document. The final native smoke run passes. A lingering early preview process also exposed Vite watching locked downloaded native files; development watchers now ignore .tools, Rust outputs, generated schemas and test artifacts. Raw failures are retained only in ignored local test artifacts; sanitized final evidence is in [NATIVE_SMOKE_RESULT.json](NATIVE_SMOKE_RESULT.json).

## Milestone tracker

| ID    | Milestone                                                           | Status                                                                                        |
| ----- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| P0    | Baseline checks, CSP, command hardening, lockfiles and test harness | Implemented; build and native x64 automation pass; remaining baseline/hardware checks open    |
| P1    | Embedded service window and touch-visible Home path                 | Native x64 proof of concept passes automation; physical Surface/ARM64 runtime acceptance OPEN |
| P2–P6 | Discovery, integrations, polish, broader security/release           | NOT STARTED                                                                                   |

## Changed files

Frontend: index.html; browser.html; package.json; package-lock.json; vite.config.js; eslint.config.js; .prettierignore; .gitignore; .gitattributes; playwright.config.js; src/main.js; src/native.js; src/style.css; src/browser-controls.js; src/browser-controls.css; src/services/defaults.js; src/services/targets.js; src/services/shortcuts.js; src/services/launch-router.js; src/services/provider-policy.json.

Native: rust-toolchain.toml; src-tauri/Cargo.toml; src-tauri/Cargo.lock; src-tauri/build.rs; src-tauri/tauri.conf.json; src-tauri/capabilities/default.json; src-tauri/capabilities/browser-controls.json; src-tauri/src/lib.rs; src-tauri/src/security.rs; src-tauri/src/policy.rs; src-tauri/src/launch.rs; src-tauri/src/browser.rs.

Tests/CI: tests/native-smoke.mjs; tests/targets.test.js; tests/shortcuts.test.js; tests/routing.test.js; tests/security-config.test.js; tests/ui/home.spec.js; tests/ui/controls.spec.js; tests/ui/csp.spec.js; .github/workflows/windows-build.yml.

Handoff: docs/NATIVE_SMOKE_RESULT.json; README.md; docs/PROGRESS.md; docs/DECISIONS.md; docs/ARCHITECTURE.md; docs/ACCEPTANCE_TESTS.md; docs/PHASE_1_SPIKE.md. Existing compressed source and touched documentation were formatted when introducing formatting checks. The cinematic layout was preserved.

## Blockers and next checklist item

Run the [hardware spike](PHASE_1_SPIKE.md) on physical x64 and ARM64 Surfaces: Home must remain touch-visible with the remote page focused/fullscreen, across rotation/DPI/task switching. Confirm provider login/playback and a self-hosted Jellyfin instance independently; test native app/media launch and installer install/uninstall. ARM64 currently has compile/unit/packaging evidence only. The local build machine also needs Visual Studio C++/SDK tools for direct compilation. Do not label Phase 1 physically accepted or start Phase 2 from the existing automation alone.
