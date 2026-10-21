// Match origins, never a shortcut's user-editable name or a substring in a URL.
export function providerIcon(app) {
  let url;
  try {
    url = new URL(app.target);
  } catch {
    return null;
  }
  if (!["https:", "http:"].includes(url.protocol)) return null;
  const hosts = {
    youtube: ["youtube.com", "youtu.be"],
    netflix: ["netflix.com"],
    plex: ["plex.tv"],
    spotify: ["spotify.com"],
    primevideo: ["primevideo.com"],
    jellyfin: ["jellyfin.org"],
  };
  for (const [icon, domains] of Object.entries(hosts))
    if (
      domains.some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    )
      return icon;
  if (app.id === "jellyfin" && url.origin === "http://localhost:8096")
    return "jellyfin";
  return null;
}

export function savedIcon(value) {
  return typeof value === "string" &&
    value.length <= 60000 &&
    /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
    ? value
    : null;
}
