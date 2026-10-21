import { providerIcon, savedIcon } from "../services/app-icons.js";
import youtube from "../assets/providers/youtube.svg";
import netflix from "../assets/providers/netflix.svg";
import plex from "../assets/providers/plex.svg";
import spotify from "../assets/providers/spotify.svg";
import primevideo from "../assets/providers/primevideo.svg";
import jellyfin from "../assets/providers/jellyfin.svg";

const icons = { youtube, netflix, plex, spotify, primevideo, jellyfin };
export function appIcon(app, className = "") {
  const mark = document.createElement("span");
  mark.className = `app-icon ${className}`;
  mark.setAttribute("aria-hidden", "true");
  mark.style.setProperty("--icon-tint", app.color || "#32485b");
  const fallback = () => {
    mark.replaceChildren();
    mark.textContent = app.mark || app.title?.[0]?.toUpperCase() || "A";
    mark.classList.add("monogram");
  };
  const brand = providerIcon(app);
  if (brand) mark.dataset.provider = brand;
  const source = savedIcon(app.icon) || icons[brand];
  if (source) {
    const image = document.createElement("img");
    image.src = source;
    image.alt = "";
    image.draggable = false;
    image.addEventListener("error", fallback, { once: true });
    mark.append(image);
  } else fallback();
  return mark;
}

export async function readUploadedIcon(file) {
  if (
    !file ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 2000000
  )
    throw new Error("Choose a PNG, JPEG or WebP image under 2 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > 16000000
    )
      throw new Error("Choose an image smaller than 16 megapixels.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const ratio = Math.min(96 / bitmap.width, 96 / bitmap.height);
    canvas
      .getContext("2d")
      .drawImage(
        bitmap,
        (96 - bitmap.width * ratio) / 2,
        (96 - bitmap.height * ratio) / 2,
        bitmap.width * ratio,
        bitmap.height * ratio,
      );
    const result = savedIcon(canvas.toDataURL("image/png"));
    if (!result)
      throw new Error("This image is too detailed. Choose a simpler icon.");
    return result;
  } finally {
    bitmap.close();
  }
}
