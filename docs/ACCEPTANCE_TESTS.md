# Acceptance and Test Matrix

Record PASS / FAIL / BLOCKED / NOT RUN, build commit/hash, exact hardware/architecture, OS build, and date for each test. **Not run is not pass.** Do not claim device coverage based on a browser preview.

## P0 — Functional baseline

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
