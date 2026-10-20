#[tauri::command]
fn open_target(target: String) -> Result<(), String> {
    let target = target.trim();
    if target.is_empty() || target.len() > 2048 {
        return Err("Invalid target length".into());
    }
    let is_url = target.starts_with("https://") || target.starts_with("http://");
    let is_path = {
        use std::path::Path;
        let path = Path::new(target);
        let valid_extension = path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "exe" | "lnk" | "url" | "mp4" | "mkv" | "avi" | "mp3" | "flac"))
            .unwrap_or(false);
        path.is_absolute() && valid_extension
    };
    if !is_url && !is_path {
        return Err("Only http(s) URLs and absolute executable, shortcut, and media file paths are allowed".into());
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let action: Vec<u16> = std::ffi::OsStr::new("open").encode_wide().chain(Some(0)).collect();
        let wide: Vec<u16> = std::ffi::OsStr::new(target).encode_wide().chain(Some(0)).collect();
        let result = unsafe { ShellExecuteW(std::ptr::null_mut(), action.as_ptr(), wide.as_ptr(), std::ptr::null(), std::ptr::null(), SW_SHOWNORMAL) };
        if (result as isize) <= 32 {
            return Err(format!("Windows could not open target (ShellExecute result {})", result as isize));
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { Err("AURA desktop launcher is currently supported on Windows only".into()) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_target])
        .run(tauri::generate_context!())
        .expect("Failed to start AURA Home Media");
}
