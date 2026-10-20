export function websiteUrl(target, allowHttp = false) {
  if (
    typeof target !== "string" ||
    target.length > 2048 ||
    /[\u0000-\u0020\u007f]/.test(target)
  )
    return null;
  if (!/^https?:\/\//i.test(target) || target.includes("\\")) return null;
  try {
    const url = new URL(target);
    if (
      url.username ||
      url.password ||
      !url.hostname ||
      !["https:", "http:"].includes(url.protocol)
    )
      return null;
    if (
      ["tauri.localhost", "ipc.localhost", "asset.localhost"].includes(
        url.hostname.toLowerCase().replace(/\.$/, ""),
      )
    )
      return null;
    if (url.protocol === "http:" && !allowHttp) return null;
    return url;
  } catch {
    return null;
  }
}

export function targetKind(target) {
  if (websiteUrl(target, true)) return "website";
  if (
    typeof target !== "string" ||
    target.length > 2048 ||
    /[\u0000-\u001f\u007f"<>|?*]/.test(target)
  )
    return null;
  // Reject device namespaces, alternate data streams and relative paths.
  if (
    !/^(?:[A-Za-z]:\\|\\\\[^\\.:]+\\[^\\:]+\\)/.test(target) ||
    target.slice(2).includes(":")
  )
    return null;
  if (target.split("\\").some((part) => part === "." || part === ".."))
    return null;
  if (/\.(exe|lnk|url)$/i.test(target)) return "windowsApp";
  if (/\.(mp4|mkv|avi|mp3|flac)$/i.test(target)) return "mediaFile";
  return null;
}
