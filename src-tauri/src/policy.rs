use crate::security;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct Route {
    pub mode: &'static str,
    pub reason: &'static str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderPolicy {
    external_domains: Vec<String>,
}

pub fn route(target: &str, kind: &str, mode: &str, allow_http: bool) -> Result<Route, String> {
    if !matches!(mode, "auto" | "internal" | "external") {
        return Err("Invalid launch mode".into());
    }
    if kind != "website" {
        if !security::local_target(target) {
            return Err("Invalid local shortcut target".into());
        }
        let lower = target.to_ascii_lowercase();
        let actual_kind = if [".exe", ".lnk", ".url"]
            .iter()
            .any(|ext| lower.ends_with(*ext))
        {
            "windowsApp"
        } else {
            "mediaFile"
        };
        if kind != actual_kind {
            return Err("Shortcut kind does not match its target".into());
        }
        return Ok(Route {
            mode: "external",
            reason: "Windows applications and media files open externally.",
        });
    }
    let url = security::website_url(target, allow_http)?;
    if mode == "external" {
        return Ok(Route {
            mode: "external",
            reason: "This shortcut is set to open externally.",
        });
    }
    let host = url
        .host_str()
        .unwrap_or_default()
        .trim_end_matches('.')
        .to_ascii_lowercase();
    let policy: ProviderPolicy =
        serde_json::from_str(include_str!("../../src/services/provider-policy.json"))
            .map_err(|_| "Invalid provider policy")?;
    let restricted = policy
        .external_domains
        .iter()
        .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")));
    if restricted && mode == "auto" {
        return Ok(Route { mode: "external", reason: "Auto opens this service externally because embedded login or protected playback is unverified." });
    }
    Ok(Route {
        mode: "internal",
        reason: "Opening inside AURA. Login and playback may require external fallback.",
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provider_policy_uses_host_boundaries_and_honors_modes() {
        for target in [
            "https://netflix.com",
            "https://watch.netflix.com",
            "https://netflix.com.",
            "https://primevideo.com",
            "https://disneyplus.com",
            "https://open.spotify.com",
        ] {
            assert_eq!(
                route(target, "website", "auto", false).unwrap().mode,
                "external"
            );
        }
        assert_eq!(
            route("https://netflix.com.evil.test", "website", "auto", false)
                .unwrap()
                .mode,
            "internal"
        );
        assert_eq!(
            route("https://example.com", "website", "external", false)
                .unwrap()
                .mode,
            "external"
        );
        assert_eq!(
            route("https://netflix.com", "website", "internal", false)
                .unwrap()
                .mode,
            "internal"
        );
        assert!(route("javascript:alert(1)", "website", "internal", false).is_err());
        assert!(route("https://example.com", "windowsApp", "auto", false).is_err());
    }
}
