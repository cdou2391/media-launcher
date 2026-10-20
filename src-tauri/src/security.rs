use tauri::Url;

pub fn trusted_page(label: &str, url: &Url) -> bool {
    let path_ok = match label {
        "main" => matches!(url.path(), "/" | "/index.html"),
        "browser-controls" => url.path() == "/browser.html",
        _ => false,
    };
    let production = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https")
            && url.host_str() == Some("tauri.localhost")
            && url.port().is_none());
    let development = cfg!(debug_assertions)
        && url.scheme() == "http"
        && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
        && url.port() == Some(5173);
    path_ok && (production || development) && url.username().is_empty() && url.password().is_none()
}

pub fn authorize(window: &tauri::WebviewWindow, main_only: bool) -> Result<(), String> {
    let url = window
        .url()
        .map_err(|_| "Unable to verify command caller")?;
    if !trusted_page(window.label(), &url) || (main_only && window.label() != "main") {
        return Err("This command is available only to trusted AURA controls".into());
    }
    Ok(())
}

pub fn website_url(target: &str, allow_http: bool) -> Result<Url, String> {
    if target.len() > 2048
        || target.chars().any(|c| c.is_control() || c.is_whitespace())
        || target.contains('\\')
        || !(target.to_ascii_lowercase().starts_with("https://")
            || target.to_ascii_lowercase().starts_with("http://"))
    {
        return Err("Enter an HTTP(S) URL without credentials or whitespace".into());
    }
    let url = Url::parse(target).map_err(|_| "Invalid website URL")?;
    if !matches!(url.scheme(), "https" | "http")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || matches!(
            url.host_str().map(|host| host.trim_end_matches('.')),
            Some("tauri.localhost" | "ipc.localhost" | "asset.localhost")
        )
    {
        return Err("This URL is not an allowed website".into());
    }
    if url.scheme() == "http" && !allow_http {
        return Err("HTTP is unencrypted. Enable HTTP explicitly for this shortcut".into());
    }
    Ok(url)
}

pub fn local_target(target: &str) -> bool {
    if target.is_empty()
        || target.len() > 2048
        || target
            .chars()
            .any(|c| c.is_control() || "\"<>|?*".contains(c))
    {
        return false;
    }
    let drive = target
        .as_bytes()
        .first()
        .is_some_and(u8::is_ascii_alphabetic)
        && target.as_bytes().get(1) == Some(&b':')
        && target.as_bytes().get(2) == Some(&b'\\');
    let unc = target.strip_prefix("\\\\").is_some_and(|rest| {
        let parts: Vec<_> = rest.split('\\').collect();
        parts.len() >= 3
            && !parts[0].is_empty()
            && !parts[1].is_empty()
            && !parts[0].contains(['.', ':'])
    });
    if !(drive || unc)
        || target.get(2..).is_some_and(|rest| rest.contains(':'))
        || target.split('\\').any(|part| matches!(part, "." | ".."))
    {
        return false;
    }
    target.rsplit('.').next().is_some_and(|ext| {
        matches!(
            ext.to_ascii_lowercase().as_str(),
            "exe" | "lnk" | "url" | "mp4" | "mkv" | "avi" | "mp3" | "flac"
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_and_wrong_window_cannot_be_trusted() {
        for (label, url) in [
            ("service", "https://example.com"),
            ("main", "https://example.com/index.html"),
            ("browser-controls", "https://example.com/browser.html"),
            ("service", "http://tauri.localhost/index.html"),
            ("main", "http://tauri.localhost/browser.html"),
            ("main", "http://localhost:9999/"),
        ] {
            assert!(!trusted_page(label, &Url::parse(url).unwrap()));
        }
        assert!(trusted_page(
            "main",
            &Url::parse("http://tauri.localhost/index.html").unwrap()
        ));
    }

    #[test]
    fn website_validation_fails_closed() {
        for value in [
            "javascript:alert(1)",
            "file:///C:/secret",
            "https://u:p@example.com",
            "https://ipc.localhost",
            "https://example.com\0",
            "https://\\evil.com",
            "http://localhost:8096",
        ] {
            assert!(website_url(value, false).is_err(), "{value}");
        }
        assert!(website_url("https://example.com", false).is_ok());
        assert!(website_url("http://localhost:8096", true).is_ok());
    }

    #[test]
    fn local_paths_are_explicit() {
        assert!(local_target(r"C:\Program Files\App\app.exe"));
        assert!(local_target(r"\\server\share\movie.mkv"));
        for value in [
            r"cmd.exe",
            r"C:app.exe",
            r"C:\app.exe:evil.exe",
            r"\\.\pipe\app.exe",
            r"C:\..\app.exe",
            "C:\\app.exe\0",
            "shell:AppsFolder",
        ] {
            assert!(!local_target(value), "{value}");
        }
    }
}
