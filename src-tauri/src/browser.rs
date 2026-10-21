use crate::{browser_media, launch, security};
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
    pub ready: bool,
}

impl BrowserStatus {
    fn navigation_started(&mut self, origin: String) -> bool {
        if self.phase == "blocked" {
            return false;
        }
        self.phase = "loading".into();
        self.message = "Loading website.".into();
        self.origin = origin;
        true
    }
    fn page_received(&mut self, origin: String) {
        self.ready = true;
        // WebView2 can complete a cancelled load after a warning was recorded.
        if matches!(self.phase.as_str(), "loading" | "slow") {
            self.phase = "received".into();
            self.message = "Page received.".into();
            self.origin = origin;
        }
    }
}

fn navigation_started(app: &AppHandle, id: u64, origin: String) {
    let state = app.state::<BrowserState>();
    let Ok(mut guard) = state.sessions.lock() else {
        return;
    };
    if let Some(session) = guard.items.iter_mut().find(|s| s.id == id) {
        if session.status.navigation_started(origin) {
            session.changed = Instant::now();
        }
    }
}

fn page_received(app: &AppHandle, id: u64, origin: String) {
    let state = app.state::<BrowserState>();
    let Ok(mut guard) = state.sessions.lock() else {
        return;
    };
    if let Some(session) = guard.items.iter_mut().find(|s| s.id == id) {
        session.status.page_received(origin);
    }
}

struct Session {
    id: u64,
    target: String,
    allow_http: bool,
    changed: Instant,
    status: BrowserStatus,
    previous_mute: bool,
    generation: u64,
    sleeping: bool,
}

#[derive(Default)]
pub struct BrowserState {
    sessions: Mutex<Sessions>,
    next: AtomicU64,
    operation: tauri::async_runtime::Mutex<()>,
}

const MAX_SESSIONS: usize = 6;

#[derive(Default)]
struct Sessions {
    items: Vec<Session>,
    active: Option<u64>,
}

impl Sessions {
    fn matching(
        &self,
        shortcut_id: &Option<String>,
        target: &str,
        allow_http: bool,
    ) -> Option<u64> {
        self.items
            .iter()
            .find(|s| {
                &s.status.shortcut_id == shortcut_id
                    && s.target == target
                    && s.allow_http == allow_http
            })
            .map(|s| s.id)
    }
    fn room(&self) -> Result<(), String> {
        if self.items.len() >= MAX_SESSIONS {
            Err("Six apps are already kept open. Close one in Open apps, then try again.".into())
        } else {
            Ok(())
        }
    }
    fn complete_suspend(&mut self, id: u64, generation: u64, sleeping: bool) {
        if self.active == Some(id) {
            return;
        }
        if let Some(session) = self
            .items
            .iter_mut()
            .find(|s| s.id == id && s.generation == generation)
        {
            session.sleeping = sleeping;
        }
    }
}

fn label(id: u64) -> String {
    format!("service-{id}")
}

pub(crate) fn suspend_completed(app: &AppHandle, id: u64, generation: u64, sleeping: bool) {
    let state = app.state::<BrowserState>();
    if let Ok(mut sessions) = state.sessions.lock() {
        sessions.complete_suspend(id, generation, sleeping);
    };
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenApp {
    session_id: u64,
    shortcut_id: Option<String>,
    title: String,
    active: bool,
    sleeping: bool,
}

#[derive(Serialize)]
pub struct OpenApps {
    limit: usize,
    items: Vec<OpenApp>,
}

fn update(app: &AppHandle, id: u64, phase: &str, message: &str, origin: Option<String>) {
    let state = app.state::<BrowserState>();
    let Ok(mut guard) = state.sessions.lock() else {
        return;
    };
    if let Some(session) = guard.items.iter_mut().find(|s| s.id == id) {
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
const TOOLBAR_HEIGHT: f64 = 56.0;

fn service_size(width: f64, height: f64) -> LogicalSize<f64> {
    LogicalSize::new(
        (width - RAIL_WIDTH).max(1.0),
        (height - TOOLBAR_HEIGHT).max(1.0),
    )
}

pub fn resize_service(app: &AppHandle) -> Result<(), String> {
    let id = app
        .state::<BrowserState>()
        .sessions
        .lock()
        .map_err(|_| "Browser state is unavailable")?
        .active;
    let Some(service) = id.and_then(|id| app.get_webview(&label(id))) else {
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

fn show_home(app: &AppHandle) -> Result<(), String> {
    app.emit_to("main", "aura-home", ())
        .map_err(|e| e.to_string())?;
    if let Some(main) = app.get_webview("main") {
        main.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn park(app: &AppHandle) -> Result<Option<u64>, String> {
    let state = app.state::<BrowserState>();
    let id = state
        .sessions
        .lock()
        .map_err(|_| "Browser state is unavailable")?
        .active;
    let Some(id) = id else {
        return Ok(None);
    };
    let Some(view) = app.get_webview(&label(id)) else {
        close_session(app, id)?;
        return Ok(None);
    };
    let previous_mute = browser_media::mute(&view, true).await?;
    if let Err(error) = view.hide() {
        let _ = browser_media::mute(&view, previous_mute).await;
        return Err(error.to_string());
    }
    let generation;
    {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "Browser state is unavailable")?;
        let session = sessions
            .items
            .iter_mut()
            .find(|s| s.id == id)
            .ok_or("App has closed")?;
        session.previous_mute = previous_mute;
        session.generation += 1;
        session.sleeping = false;
        generation = session.generation;
        sessions.active = None;
    }
    browser_media::suspend(&view, app, id, generation);
    Ok(Some(id))
}

async fn activate(app: &AppHandle, id: u64) -> Result<(), String> {
    let view = app
        .get_webview(&label(id))
        .ok_or("This app has closed. Close its card and open the shortcut again.")?;
    browser_media::resume(&view).await?;
    {
        let state = app.state::<BrowserState>();
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "Browser state is unavailable")?;
        let session = sessions
            .items
            .iter_mut()
            .find(|s| s.id == id)
            .ok_or("This app has closed")?;
        session.generation += 1;
        session.sleeping = false;
        sessions.active = Some(id);
    }
    resize_service(app)?;
    app.emit_to("main", "aura-browser", ())
        .map_err(|e| e.to_string())
}

fn close_session(app: &AppHandle, id: u64) -> Result<bool, String> {
    // Retain the record when native close fails. No hidden app is silently evicted.
    if let Some(view) = app.get_webview(&label(id)) {
        view.close().map_err(|e| e.to_string())?;
    }
    let state = app.state::<BrowserState>();
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Browser state is unavailable")?;
    let active = sessions.active == Some(id);
    sessions.items.retain(|s| s.id != id);
    if active {
        sessions.active = None;
    }
    Ok(active)
}

#[tauri::command]
pub async fn open_internal(
    window: Webview,
    app: AppHandle,
    target: String,
    title: String,
    allow_http: bool,
    shortcut_id: Option<String>,
) -> Result<bool, String> {
    security::authorize(&window, true)?;
    let state = app.state::<BrowserState>();
    let _operation = state.operation.lock().await;
    let url = security::website_url(&target, allow_http)?;
    if title.is_empty() || title.chars().count() > 48 || title.chars().any(char::is_control) {
        return Err("Invalid service name".into());
    }
    let shortcut_id = shortcut_id
        .filter(|id| !id.is_empty() && id.len() <= 128 && !id.chars().any(char::is_control));
    let existing;
    {
        let sessions = state
            .sessions
            .lock()
            .map_err(|_| "Browser state is unavailable")?;
        existing = sessions.matching(&shortcut_id, url.as_str(), allow_http);
        if existing.is_none() {
            sessions.room()?;
        }
        if existing.is_some() && existing == sessions.active {
            return Ok(true);
        }
    }
    let previous = park(&app).await?;
    if let Some(id) = existing {
        if let Err(error) = activate(&app, id).await {
            if let Some(previous) = previous {
                let _ = activate(&app, previous).await;
            }
            return Err(error);
        }
        return Ok(true);
    }
    let id = state.next.fetch_add(1, Ordering::Relaxed) + 1;
    {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "Browser state is unavailable")?;
        sessions.items.push(Session {
            id,
            target: url.to_string(),
            allow_http,
            changed: Instant::now(),
            previous_mute: false,
            generation: 0,
            sleeping: false,
            status: BrowserStatus {
                session_id: id,
                shortcut_id,
                title,
                origin: url.origin().ascii_serialization(),
                phase: "loading".into(),
                message: "Opening website.".into(),
                ready: false,
            },
        });
        sessions.active = Some(id);
    }
    if let Err(error) = create_view(&app, id, url, allow_http).await {
        let _ = close_session(&app, id);
        if let Some(previous) = previous {
            let _ = activate(&app, previous).await;
        }
        return Err(format!(
            "Internal browsing could not start: {error}. Try Open externally."
        ));
    }
    Ok(false)
}

#[cfg(not(feature = "embedded-browser"))]
async fn create_view(
    _app: &AppHandle,
    _id: u64,
    _url: tauri::Url,
    _allow_http: bool,
) -> Result<(), String> {
    Err("This build has internal browsing disabled. Use Open externally".into())
}

#[cfg(feature = "embedded-browser")]
async fn create_view(
    app: &AppHandle,
    id: u64,
    url: tauri::Url,
    allow_http: bool,
) -> Result<(), String> {
    let main = app.get_window("main").ok_or("AURA Home is unavailable")?;
    let scale = main.scale_factor().map_err(|e| e.to_string())?;
    let size = main
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale);
    let nav_app = app.clone();
    let popup_app = app.clone();
    let load_app = app.clone();
    let builder = tauri::webview::WebviewBuilder::new(label(id), WebviewUrl::External(url))
        .background_color(tauri::utils::config::Color(11, 18, 29, 255))
        .disable_drag_drop_handler()
        .on_navigation(move |next| {
            // No local asset, file, custom scheme or privileged origin navigation.
            let allowed = security::website_url(next.as_str(), allow_http).is_ok()
                && !security::trusted_page("main", next);
            if !allowed { update(&nav_app, id, "blocked", "This navigation is blocked. Return using the sidebar and choose External for this shortcut if sign-in requires it.", None); }
            else { navigation_started(&nav_app, id, next.origin().ascii_serialization()); }
            allowed
        })
        .on_new_window(move |_, _| {
            update(&popup_app, id, "blocked", "This website requested a popup. Return using the sidebar and choose External for this shortcut to continue sign-in.", None);
            NewWindowResponse::Deny
        })
        .on_download(|_, _| false)
        .on_page_load(move |_, payload| {
            if payload.event() == PageLoadEvent::Finished
                && security::website_url(payload.url().as_str(), allow_http).is_ok() {
                page_received(&load_app, id, payload.url().origin().ascii_serialization());
            }
        })
;
    // Window::add_child must run from this async command, not a UI event handler.
    // Build outside the visible client area, then hide before applying the
    // normal bounds. HTML cannot cover a native child: trusted UI explicitly
    // reveals this exact session after its first document-finished signal.
    let service = main
        .add_child(
            builder,
            LogicalPosition::new(-size.width - 1.0, TOOLBAR_HEIGHT),
            service_size(size.width, size.height),
        )
        .map_err(|e| e.to_string())?;
    browser_media::mute(&service, true).await?;
    service.hide().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    crate::window_mode::isolate_site_fullscreen(&service, app).await?;
    resize_service(app)?;
    app.emit_to("main", "aura-browser", ())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn browser_status(window: Webview, app: AppHandle) -> Result<Option<BrowserStatus>, String> {
    security::authorize(&window, false)?;
    let state = app.state::<BrowserState>();
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Browser state is unavailable")?;
    let active = sessions.active;
    let Some(session) = sessions.items.iter_mut().find(|s| Some(s.id) == active) else {
        return Ok(None);
    };
    if session.status.phase == "loading" && session.changed.elapsed() > Duration::from_secs(20) {
        session.status.phase = "slow".into();
        session.status.message = "The website is taking too long. Refresh or return using the sidebar. Choose External for this shortcut if required.".into();
    }
    Ok(Some(session.status.clone()))
}

#[tauri::command]
pub fn browser_sessions(window: Webview, app: AppHandle) -> Result<OpenApps, String> {
    security::authorize(&window, false)?;
    let state = app.state::<BrowserState>();
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "Browser state is unavailable")?;
    Ok(OpenApps {
        limit: MAX_SESSIONS,
        items: sessions
            .items
            .iter()
            .map(|s| OpenApp {
                session_id: s.id,
                shortcut_id: s.status.shortcut_id.clone(),
                title: s.status.title.clone(),
                active: sessions.active == Some(s.id),
                sleeping: s.sleeping,
            })
            .collect(),
    })
}

#[tauri::command]
pub async fn browser_home(window: Webview, app: AppHandle) -> Result<(), String> {
    security::authorize(&window, false)?;
    let state = app.state::<BrowserState>();
    let _operation = state.operation.lock().await;
    park(&app).await?;
    show_home(&app)
}

#[tauri::command]
pub async fn browser_resume(
    window: Webview,
    app: AppHandle,
    session_id: u64,
) -> Result<(), String> {
    security::authorize(&window, false)?;
    let state = app.state::<BrowserState>();
    let _operation = state.operation.lock().await;
    {
        let sessions = state
            .sessions
            .lock()
            .map_err(|_| "Browser state is unavailable")?;
        if !sessions.items.iter().any(|s| s.id == session_id) {
            return Err("This app is no longer open".into());
        }
        if sessions.active == Some(session_id) {
            return Ok(());
        }
    }
    let previous = park(&app).await?;
    if let Err(error) = activate(&app, session_id).await {
        if let Some(previous) = previous {
            let _ = activate(&app, previous).await;
        }
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_close(window: Webview, app: AppHandle, session_id: u64) -> Result<(), String> {
    security::authorize(&window, false)?;
    let state = app.state::<BrowserState>();
    let _operation = state.operation.lock().await;
    if close_session(&app, session_id)? {
        show_home(&app)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_reveal(
    window: Webview,
    app: AppHandle,
    session_id: u64,
) -> Result<(), String> {
    security::authorize(&window, false)?;
    let state = app.state::<BrowserState>();
    let _operation = state.operation.lock().await;
    let previous_mute;
    {
        let sessions = state
            .sessions
            .lock()
            .map_err(|_| "Browser state is unavailable")?;
        let session = sessions
            .items
            .iter()
            .find(|s| s.id == session_id && sessions.active == Some(s.id))
            .ok_or("This app is no longer active")?;
        if !session.status.ready {
            return Err("The website has not received its first document yet".into());
        }
        previous_mute = session.previous_mute;
    }
    let service = app
        .get_webview(&label(session_id))
        .ok_or("The website has closed")?;
    service.show().map_err(|e| e.to_string())?;
    if let Err(error) = browser_media::mute(&service, previous_mute).await {
        let _ = service.hide();
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_retry(window: Webview, app: AppHandle) -> Result<(), String> {
    security::authorize(&window, false)?;
    let state = app.state::<BrowserState>();
    let _operation = state.operation.lock().await;
    let (id, target, allow_http) = active_target(&app)?;
    let url = security::website_url(&target, allow_http)?;
    update(
        &app,
        id,
        "loading",
        "Refreshing the original shortcut.",
        Some(url.origin().ascii_serialization()),
    );
    app.get_webview(&label(id))
        .ok_or("Service closed. Close its card and reopen the shortcut.")?
        .navigate(url)
        .map_err(|e| e.to_string())
}

fn active_target(app: &AppHandle) -> Result<(u64, String, bool), String> {
    let state = app.state::<BrowserState>();
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "Browser state is unavailable")?;
    let session = sessions
        .items
        .iter()
        .find(|s| Some(s.id) == sessions.active)
        .ok_or("No website is active")?;
    Ok((session.id, session.target.clone(), session.allow_http))
}

#[tauri::command]
pub async fn browser_external(window: Webview, app: AppHandle) -> Result<(), String> {
    security::authorize(&window, false)?;
    let state = app.state::<BrowserState>();
    let _operation = state.operation.lock().await;
    let (_, target, allow_http) = active_target(&app)?;
    launch::open_external(&target, allow_http)?;
    park(&app).await?;
    show_home(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(id: u64) -> Session {
        Session {
            id,
            target: format!("https://example.com/{id}"),
            allow_http: false,
            changed: Instant::now(),
            previous_mute: false,
            generation: 1,
            sleeping: false,
            status: BrowserStatus {
                session_id: id,
                shortcut_id: Some(format!("app-{id}")),
                title: "Test".into(),
                origin: "https://example.com".into(),
                phase: "received".into(),
                message: "Page received".into(),
                ready: true,
            },
        }
    }

    #[test]
    fn retained_app_identity_includes_approved_target_and_http_consent() {
        let store = Sessions {
            items: vec![session(1)],
            active: None,
        };
        assert_eq!(
            store.matching(&Some("app-1".into()), "https://example.com/1", false),
            Some(1)
        );
        assert_eq!(
            store.matching(&Some("app-1".into()), "https://example.com/changed", false),
            None
        );
        assert_eq!(
            store.matching(&Some("app-2".into()), "https://example.com/1", false),
            None
        );
        assert_eq!(
            store.matching(&Some("app-1".into()), "https://example.com/1", true),
            None
        );
    }

    #[test]
    fn capacity_rejects_new_apps_without_discarding_existing_pages() {
        let store = Sessions {
            items: (1..=MAX_SESSIONS as u64).map(session).collect(),
            active: Some(1),
        };
        assert!(store.room().is_err());
        assert_eq!(store.items.len(), MAX_SESSIONS);
        assert_eq!(store.active, Some(1));
        assert_eq!(
            store.matching(&Some("app-1".into()), "https://example.com/1", false),
            Some(1)
        );
    }

    #[test]
    fn late_suspend_callbacks_cannot_change_active_or_reparked_apps() {
        let mut store = Sessions {
            items: vec![session(1)],
            active: Some(1),
        };
        store.complete_suspend(1, 1, true);
        assert!(!store.items[0].sleeping);
        store.active = None;
        store.items[0].generation = 3;
        store.complete_suspend(1, 1, true);
        assert!(!store.items[0].sleeping);
        store.complete_suspend(1, 3, true);
        assert!(store.items[0].sleeping);
        store.items.clear();
        store.complete_suspend(1, 3, true);
        assert!(store.items.is_empty());
    }

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
            ready: false,
        };
        status.navigation_started("http://tauri.localhost".into());
        status.page_received("http://tauri.localhost".into());
        assert_eq!(status.phase, "blocked");
        assert_eq!(status.message, "Navigation blocked");
        assert_eq!(status.origin, "https://example.com");
        assert!(status.ready);
        status.phase = "loading".into();
        status.page_received("https://example.org".into());
        assert_eq!(status.phase, "received");
        assert_eq!(status.origin, "https://example.org");
    }
}
