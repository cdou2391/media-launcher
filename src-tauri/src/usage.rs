use crate::security;
use tauri::Webview;

// Report only whether AURA's own native window is foreground. No process list,
// remote-page activity or other application's identity is exposed to the UI.
#[tauri::command]
pub fn usage_foreground(window: Webview) -> Result<bool, String> {
    security::authorize(&window, true)?;
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsIconic};
        let hwnd = window.window().hwnd().map_err(|error| error.to_string())?;
        Ok(unsafe { GetForegroundWindow() == hwnd.0 && IsIconic(hwnd.0) == 0 })
    }
    #[cfg(not(target_os = "windows"))]
    window
        .window()
        .is_focused()
        .map_err(|error| error.to_string())
}
