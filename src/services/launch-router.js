import policy from "./provider-policy.json" with { type: "json" };
import { targetKind, websiteUrl } from "./targets.js";

export function launchRoute(shortcut) {
  const kind = targetKind(shortcut.target);
  if (!kind || kind !== shortcut.kind)
    throw new Error(
      "Invalid shortcut kind or target. Edit this shortcut first.",
    );
  if (!["auto", "internal", "external"].includes(shortcut.launchMode))
    throw new Error("Choose a valid launch mode.");
  if (kind !== "website")
    return {
      mode: "external",
      reason: "Windows applications and media files open externally.",
    };
  const url = websiteUrl(shortcut.target, shortcut.allowHttp === true);
  if (!url)
    throw new Error(
      "HTTP is unencrypted. Edit this shortcut to explicitly allow HTTP, or use HTTPS.",
    );
  if (shortcut.launchMode === "external")
    return {
      mode: "external",
      reason: "This shortcut is set to open externally.",
    };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const restricted = policy.externalDomains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
  if (restricted && shortcut.launchMode === "auto")
    return {
      mode: "external",
      reason:
        "Auto opens this service externally because embedded login or protected playback is unverified.",
    };
  return {
    mode: "internal",
    reason: restricted
      ? "Internal is an explicit override. Login and protected playback may require Open externally."
      : "Open inside AURA. Website compatibility is unverified; external fallback remains available.",
  };
}

export function routeLabel(shortcut) {
  try {
    const route = launchRoute(shortcut);
    return `${shortcut.launchMode === "auto" ? "Auto · " : ""}${route.mode === "internal" ? "Inside AURA" : "External"}`;
  } catch {
    return "Edit to enable";
  }
}
