use crate::{launch, security};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserStatus {
    pub session_id: u64,
    pub shortcut_id: Option<String>,
    pub title: String,
    pub origin: String,
    pub phase: String,
    pub message: String,
}

impl BrowserStatus {
    fn navigation_started(&mut self, origin: String) -> bool {
        if self.phase == "blocked" {
            return false;
        }
        self.phase = "loading".into();
        self.message = "Loading website. Home and external fallback remain available.".into();
        self.origin = origin;
        true
    }
    fn page_received(&mut self, origin: String) {
        // WebView2 can complete a cancelled load after a warning was recorded.
        if matches!(self.phase.as_str(), "loading" | "slow") {
            self.phase = "received".into();
            self.message = "Page received. If login, playback or the page fails, use Retry or Open externally.".into();
            self.origin = origin;
        }
    }
}

fn navigation_started(app: &AppHandle, id: u64, origin: String) {
    let state = app.state::<BrowserState>();
    let Ok(mut guard) = state.session.lock() else {
        return;
    };
    if let Some(session) = guard.as_mut().filter(|s| s.id == id) {
        if session.status.navigation_started(origin) {
            session.changed = Instant::now();
        }
    }
}

fn page_received(app: &AppHandle, id: u64, origin: String) {
    let state = app.state::<BrowserState>();
    let Ok(mut guard) = state.session.lock() else {
        return;
    };
    if let Some(session) = guard.as_mut().filter(|s| s.id == id) {
        session.status.page_received(origin);
    }
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
    operation: tauri::async_runtime::Mutex<()>,
}

fn update(app: &AppHandle, id: u64, phase: &str, message: &str, origin: Option<String>) {
    let state = app.state::<BrowserState>();
    let Ok(mut guard) = state.session.lock() else {
        return;
    };
    if let Some(session) = guard.as_mut().filter(|s| s.id == id) {
        session.status.phase = phase.into();
        session.status.message = message.into();
        if let Some(origin) = origin {
            session.status.origin = origin;
        }
        session.changed = Instant::now();
    }
}

// These logical insets match the browser workspace in src/style.css. Native
// bounds reserve the rail and toolbar; remote HTML cannot draw over either.
const RAIL_WIDTH: f64 = 90.0;
const TOOLBAR_HEIGHT: f64 = 128.0;

fn service_size(width: f64, height: f64) -> LogicalSize<f64> {
    LogicalSize::new(
        (width - RAIL_WIDTH).max(1.0),
        (height - TOOLBAR_HEIGHT).max(1.0),
    )
}

pub fn resize_service(app: &AppHandle) -> Result<(), String> {
    let Some(service) = app.get_webview("service") else {
        return Ok(());
    };
    let main = app.get_window("main").ok_or("AURA Home is unavailable")?;
    let scale = main.scale_factor().map_err(|e| e.to_string())?;
    let size = main
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale);
    service
        .set_bounds(tauri::Rect {
            position: LogicalPosition::new(RAIL_WIDTH, TOOLBAR_HEIGHT).into(),
            size: service_size(size.width, size.height).into(),
        })
        .map_err(|e| e.to_string())
}

fn finish(app: &AppHandle, expected_id: Option<u64>) -> Result<(), String> {
    let state = app.state::<BrowserState>();
    {
        let guard = state
            .session
            .lock()
            .map_err(|_| "Browser state is unavailable")?;
        if expected_id.is_some_and(|id| guard.as_ref().is_none_or(|s| s.id != id)) {
            return Ok(());
        }
    }
    // Close only the remote child, never its shared AURA window. Retain the
    // session if close fails so Home/Retry can recover instead of orphaning it.
    if let Some(service) = app.get_webview("service") {
        service.close().map_err(|e| e.to_string())?;
    }
    *state
        .session
        .lock()
        .map_err(|_| "Browser state is unavailable")? = None;
    if let Some(main) = app.get_window("main") {
        let _ = app.emit_to("main", "aura-home", ());
        main.show().map_err(|e| e.to_string())?;
        main.unminimize().map_err(|e| e.to_string())?;
        main.set_focus().map_err(|e| e.to_string())?;
    }
    if let Some(main) = app.get_webview("main") {
        main.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_internal(
    window: Webview,
    app: AppHandle,
    target: String,
    title: String,
    allow_http: bool,
    shortcut_id: Option<String>,
) -> Result<(), String> {
    security::authorize(&window, true)?;
    let state = app.state::<BrowserState>();
    let _operation = state.operation.lock().await;
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
                session_id: id,
                shortcut_id: shortcut_id.filter(|id| {
                    !id.is_empty() && id.len() <= 128 && !id.chars().any(char::is_control)
                }),
                title: title.clone(),
                origin: url.origin().ascii_serialization(),
                phase: "loading".into(),
                message: "Opening the website. Home and external fallback remain available.".into(),
            },
        });
    }
    let result = create_view(&app, id, url, allow_http);
    if let Err(error) = result {
        let _ = finish(&app, Some(id));
        return Err(format!(
            "Internal browsing could not start: {error}. Try Open externally."
        ));
    }
    Ok(())
}

#[cfg(not(feature = "embedded-browser"))]
fn create_view(
    _app: &AppHandle,
    _id: u64,
    _url: tauri::Url,
    _allow_http: bool,
) -> Result<(), String> {
    Err("This build has internal browsing disabled. Use Open externally".into())
}

#[cfg(feature = "embedded-browser")]
fn create_view(app: &AppHandle, id: u64, url: tauri::Url, allow_http: bool) -> Result<(), String> {
    let main = app.get_window("main").ok_or("AURA Home is unavailable")?;
    let scale = main.scale_factor().map_err(|e| e.to_string())?;
    let size = main
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale);
    let nav_app = app.clone();
    let popup_app = app.clone();
    let load_app = app.clone();
    let builder = tauri::webview::WebviewBuilder::new("service", WebviewUrl::External(url))
        .disable_drag_drop_handler()
        .on_navigation(move |next| {
            // No local asset, file, custom scheme or privileged origin navigation.
            let allowed = security::website_url(next.as_str(), allow_http).is_ok()
                && !security::trusted_page("main", next);
            if !allowed { update(&nav_app, id, "blocked", "This navigation is blocked. Use Open externally for supported sign-in flows.", None); }
            else { navigation_started(&nav_app, id, next.origin().ascii_serialization()); }
            allowed
        })
        .on_new_window(move |_, _| {
            update(&popup_app, id, "blocked", "This website requested a popup. Use Open externally to continue sign-in or open that experience.", None);
            NewWindowResponse::Deny
        })
        .on_download(|_, _| false)
        .on_page_load(move |_, payload| {
            if payload.event() == PageLoadEvent::Finished {
                page_received(&load_app, id, payload.url().origin().ascii_serialization());
            }
        })
;
    // Window::add_child must run from this async command, not a UI event handler.
    main.add_child(
        builder,
        LogicalPosition::new(RAIL_WIDTH, TOOLBAR_HEIGHT),
        service_size(size.width, size.height),
    )
    .map_err(|e| e.to_string())?;
    app.emit_to("main", "aura-browser", ())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn browser_status(window: Webview, app: AppHandle) -> Result<Option<BrowserStatus>, String> {
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
pub async fn browser_home(window: Webview, app: AppHandle) -> Result<(), String> {
    security::authorize(&window, false)?;
    let state = app.state::<BrowserState>();
    let _operation = state.operation.lock().await;
    finish(&app, None)
}

#[tauri::command]
pub async fn browser_retry(window: Webview, app: AppHandle) -> Result<(), String> {
    security::authorize(&window, false)?;
    let state = app.state::<BrowserState>();
    let _operation = state.operation.lock().await;
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
    app.get_webview("service")
        .ok_or("Service closed. Return Home and reopen the shortcut.")?
        .navigate(url)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_external(window: Webview, app: AppHandle) -> Result<(), String> {
    security::authorize(&window, false)?;
    let state = app.state::<BrowserState>();
    let _operation = state.operation.lock().await;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn site_bounds_reserve_navigation_at_portrait_and_landscape_sizes() {
        for (width, height) in [(620.0, 470.0), (900.0, 1400.0), (1400.0, 900.0)] {
            let site = service_size(width, height);
            assert_eq!(site.width + RAIL_WIDTH, width);
            assert_eq!(site.height + TOOLBAR_HEIGHT, height);
            assert!(site.width > 0.0 && site.height > 0.0);
        }
    }

    #[test]
    fn cancelled_load_completion_keeps_navigation_or_popup_warning() {
        let mut status = BrowserStatus {
            session_id: 1,
            shortcut_id: None,
            title: "Fixture".into(),
            origin: "https://example.com".into(),
            phase: "blocked".into(),
            message: "Navigation blocked".into(),
        };
        status.navigation_started("http://tauri.localhost".into());
        status.page_received("http://tauri.localhost".into());
        assert_eq!(status.phase, "blocked");
        assert_eq!(status.message, "Navigation blocked");
        assert_eq!(status.origin, "https://example.com");
        status.phase = "loading".into();
        status.page_received("https://example.org".into());
        assert_eq!(status.phase, "received");
        assert_eq!(status.origin, "https://example.org");
    }
}
