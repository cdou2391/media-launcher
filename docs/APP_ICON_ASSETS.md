# App icons and cards

Six provider SVGs are bundled in `src/assets/providers/`. They come from the
[Simple Icons 11.15.0 source](https://github.com/simple-icons/simple-icons/tree/11.15.0/icons):
[YouTube](https://github.com/simple-icons/simple-icons/blob/11.15.0/icons/youtube.svg),
[Netflix](https://github.com/simple-icons/simple-icons/blob/11.15.0/icons/netflix.svg),
[Plex](https://github.com/simple-icons/simple-icons/blob/11.15.0/icons/plex.svg),
[Spotify](https://github.com/simple-icons/simple-icons/blob/11.15.0/icons/spotify.svg),
[Prime Video](https://github.com/simple-icons/simple-icons/blob/11.15.0/icons/primevideo.svg) and
[Jellyfin](https://github.com/simple-icons/simple-icons/blob/11.15.0/icons/jellyfin.svg).
The SVG root fill uses each provider's identifying color. Paths are unchanged.
Simple Icons distributes its work under [CC0](https://github.com/simple-icons/simple-icons/blob/11.15.0/LICENSE.md);
brand trademarks remain their owners' property. Inclusion does not imply endorsement.

Icons are static local images; no runtime favicon requests, third-party icon CDN,
remote scripts or native file access are involved. Provider selection uses exact
host/subdomain boundaries rather than shortcut names, IDs or URL substrings. The
bundled localhost Jellyfin shortcut has a narrowly matched default origin.
Other shortcuts preserve their saved color and monogram.

Edit shortcut offers PNG/JPEG/WebP upload under 2 MB. Browser decoding rasterizes
the image into a 96px square PNG capped at 60,000 data-URL characters. Images over
16 megapixels, SVG uploads and remote icon URLs are rejected. An optional `icon`
field extends v2 shortcuts without a schema reset. Use automatic icon removes the
custom override; failed images show the monogram. Storage failure keeps the
existing saved data and displays the existing session-only notice.

Home and Applications share a card containing independent launch, favorite and
options controls. A native HTML disclosure lists Edit shortcut, Launch options
and Remove shortcut. It supports keyboard activation, Escape, outside dismissal,
one open panel and focus return. Every control is at least 44px high. Open apps
uses the same icon component in horizontal cards with existing Return/Close
actions and Active/Sleeping/Kept open status. These states describe native session
state, not a guarantee that a provider's player has paused.
