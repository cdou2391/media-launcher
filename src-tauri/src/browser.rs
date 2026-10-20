use crate::{launch, security};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent},
    AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserStatus {
    pub title: String,
    pub origin: String,
    pub phase: String,
    pub message: String,
}

struct Session {
    id: u64,
    target: String,
    allow_http: bool,
    changed: Instant,
    status: BrowserStatus,
}

#[derive(Default)]
pub struct BrowserState {
    session: Mutex<Option<Session>>,
    next: AtomicU64,
}

fn update(app: &AppHandle, id: u64, phase: &str, message: &str, origin: Option<String>) {
    if let Ok(mut guard) = app.state::<BrowserState>().session.lock() {
        if let Some(session) = guard.as_mut().filter(|s| s.id == id) {
            session.status.phase = phase.into();
            session.status.message = message.into();
            if let Some(origin) = origin {
                session.status.origin = origin;
            }
            session.changed = Instant::now();
        }
    }
}

// Owned native window: Windows keeps this above the remote service, without a
// system-wide always-on-top overlay. Re-anchor after rotation, move or DPI change.
fn position_controls(app: &AppHandle) -> Result<(), String> {
    let service = app
        .get_webview_window("service")
        .ok_or("Service window is unavailable")?;
    let controls = app
        .get_webview_window("browser-controls")
        .ok_or("Home controls are unavailable")?;
    let monitor = service
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No active monitor")?;
    let scale = monitor.scale_factor();
    let work = monitor.work_area();
    let width = (f64::from(work.size.width) / scale - 32.0).clamp(280.0, 760.0);
    controls
        .set_size(tauri::LogicalSize::new(
            width,
            if width < 470.0 { 264.0 } else { 188.0 },
        ))
        .map_err(|e| e.to_string())?;
    controls
        .set_position(LogicalPosition::new(
            f64::from(work.position.x) / scale + 16.0,
            f64::from(work.position.y) / scale + 16.0,
        ))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn finish(app: &AppHandle, expected_id: Option<u64>) -> Result<(), String> {
    let state = app.state::<BrowserState>();
    {
        let mut guard = state
            .session
            .lock()
            .map_err(|_| "Browser state is unavailable")?;
        if expected_id.is_some_and(|id| guard.as_ref().is_none_or(|s| s.id != id)) {
            return Ok(());
        }
        *guard = None;
    }
    let mut failure = None;
    for label in ["browser-controls", "service"] {
        if let Some(window) = app.get_webview_window(label) {
            if let Err(error) = window.destroy() {
                failure = Some(error.to_string());
            }
        }
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = app.emit_to("main", "aura-home", ());
        main.show().map_err(|e| e.to_string())?;
        main.unminimize().map_err(|e| e.to_string())?;
        main.set_focus().map_err(|e| e.to_string())?;
    }
    failure.map_or(Ok(()), Err)
}

#[tauri::command]
pub async fn open_internal(
    window: WebviewWindow,
    app: AppHandle,
    target: String,
    title: String,
    allow_http: bool,
) -> Result<(), String> {
    security::authorize(&window, true)?;
    let url = security::website_url(&target, allow_http)?;
    if title.is_empty() || title.chars().count() > 48 || title.chars().any(char::is_control) {
        return Err("Invalid service name".into());
    }
    let id;
    {
        let state = app.state::<BrowserState>();
        let mut guard = state
            .session
            .lock()
            .map_err(|_| "Browser state is unavailable")?;
        if guard.is_some() {
            return Err("Return to AURA Home before opening another service".into());
        }
        id = state.next.fetch_add(1, Ordering::Relaxed) + 1;
        *guard = Some(Session {
            id,
            target: url.to_string(),
            allow_http,
            changed: Instant::now(),
            status: BrowserStatus {
                title: title.clone(),
                origin: url.origin().ascii_serialization(),
                phase: "loading".into(),
                message: "Opening the website. Home and external fallback remain available.".into(),
            },
        });
    }
    let result = create_windows(&app, id, url, &title, allow_http);
    if let Err(error) = result {
        let _ = finish(&app, Some(id));
        return Err(format!(
            "Internal browsing could not start: {error}. Try Open externally."
        ));
    }
    Ok(())
}

fn create_windows(
    app: &AppHandle,
    id: u64,
    url: tauri::Url,
    title: &str,
    allow_http: bool,
) -> Result<(), String> {
    let nav_app = app.clone();
    let popup_app = app.clone();
    let load_app = app.clone();
    let service = WebviewWindowBuilder::new(app, "service", WebviewUrl::External(url))
        .title(format!("{title} — AURA service"))
        .inner_size(1100.0, 760.0)
        .min_inner_size(360.0, 400.0)
        .decorations(true)
        .visible(false)
        .disable_drag_drop_handler()
        .on_navigation(move |next| {
            // No local asset, file, custom scheme or privileged origin navigation.
            let allowed = security::website_url(next.as_str(), allow_http).is_ok();
            if !allowed { update(&nav_app, id, "blocked", "This navigation is blocked. Use Open externally for supported sign-in flows.", None); }
            allowed
        })
        .on_new_window(move |_, _| {
            update(&popup_app, id, "blocked", "This website requested a popup. Use Open externally to continue sign-in or open that experience.", None);
            NewWindowResponse::Deny
        })
        .on_download(|_, _| false)
        .on_page_load(move |_, payload| {
            let (phase, message) = match payload.event() {
                PageLoadEvent::Started => ("loading", "Loading website. Home and external fallback remain available."),
                PageLoadEvent::Finished => ("received", "Page received. If login, playback or the page fails, use Retry or Open externally."),
            };
            update(&load_app, id, phase, message, Some(payload.url().origin().ascii_serialization()));
        })
        .build().map_err(|e| e.to_string())?;
    let controls = WebviewWindowBuilder::new(
        app,
        "browser-controls",
        WebviewUrl::App("browser.html".into()),
    )
    .title("AURA — Return to Home")
    .inner_size(760.0, 188.0)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .decorations(true)
    .skip_taskbar(true)
    .visible(false)
    .parent(&service)
    .map_err(|e| e.to_string())?
    .on_navigation(|next| security::trusted_page("browser-controls", next))
    .on_new_window(|_, _| NewWindowResponse::Deny)
    .build()
    .map_err(|e| e.to_string())?;
    let close_app = app.clone();
    controls.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let app = close_app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = finish(&app, Some(id));
            });
        }
    });
    let event_app = app.clone();
    service.on_window_event(move |event| match event {
        WindowEvent::Destroyed => {
            let app = event_app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = finish(&app, Some(id));
            });
        }
        WindowEvent::Moved(_)
        | WindowEvent::Resized(_)
        | WindowEvent::ScaleFactorChanged { .. } => {
            let _ = position_controls(&event_app);
        }
        _ => {}
    });
    service.maximize().map_err(|e| e.to_string())?;
    position_controls(app)?;
    service.show().map_err(|e| e.to_string())?;
    controls.show().map_err(|e| e.to_string())?;
    controls.set_focus().map_err(|e| e.to_string())?;
    // Hide only after both windows and the return path exist.
    app.get_webview_window("main")
        .ok_or("AURA Home is unavailable")?
        .hide()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn browser_status(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<Option<BrowserStatus>, String> {
    security::authorize(&window, false)?;
    let state = app.state::<BrowserState>();
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "Browser state is unavailable")?;
    if let Some(session) = guard.as_mut() {
        if session.status.phase == "loading" && session.changed.elapsed() > Duration::from_secs(20)
        {
            session.status.phase = "slow".into();
            session.status.message =
                "The website is taking too long. Check your connection, Retry or Open externally."
                    .into();
        }
    }
    Ok(guard.as_ref().map(|s| s.status.clone()))
}

#[tauri::command]
pub async fn browser_home(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    security::authorize(&window, false)?;
    finish(&app, None)
}

#[tauri::command]
pub async fn browser_retry(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    security::authorize(&window, false)?;
    let (id, target, allow_http) = {
        let state = app.state::<BrowserState>();
        let guard = state
            .session
            .lock()
            .map_err(|_| "Browser state is unavailable")?;
        let session = guard.as_ref().ok_or("No website is open")?;
        (session.id, session.target.clone(), session.allow_http)
    };
    let url = security::website_url(&target, allow_http)?;
    update(
        &app,
        id,
        "loading",
        "Retrying the original shortcut.",
        Some(url.origin().ascii_serialization()),
    );
    app.get_webview_window("service")
        .ok_or("Service closed. Return Home and reopen the shortcut.")?
        .navigate(url)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_external(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    security::authorize(&window, false)?;
    let (target, allow_http) = {
        let state = app.state::<BrowserState>();
        let guard = state
            .session
            .lock()
            .map_err(|_| "Browser state is unavailable")?;
        let session = guard.as_ref().ok_or("No website is open")?;
        (session.target.clone(), session.allow_http)
    };
    // Only the originally approved target, never a remote-supplied popup URL.
    launch::open_external(&target, allow_http)?;
    finish(&app, None)
}
