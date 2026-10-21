import { appIcon } from "./app-icon.js";
export function setupFavoritesRail({ onLaunch }) {
  const rail = document.querySelector(".rail");
  const group = document.querySelector("#rail-favorites");
  const list = document.querySelector("#rail-favorite-list");
  const toggle = document.querySelector("#rail-favorites-toggle");
  const mobile = window.matchMedia("(max-width: 580px)");
  let selectedId = null;
  let busy = false;
  let rendered = null;
  let openIds = new Set();

  function setOpenIds(ids) {
    openIds = new Set(ids.filter(Boolean));
    for (const button of list.children) {
      const open = openIds.has(button.dataset.shortcutId);
      button.classList.toggle("is-open", open);
      button.title = `${button.querySelector(".rail-favorite-name").textContent}${open ? " · Kept open" : ""}`;
    }
  }

  function close({ restoreFocus = false } = {}) {
    rail.classList.remove("favorites-open");
    toggle.setAttribute("aria-expanded", "false");
    if (restoreFocus) toggle.focus();
  }

  function select(id) {
    selectedId = id;
    for (const button of list.children) {
      if (id && button.dataset.shortcutId === id)
        button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }

  function setBusy(value) {
    busy = value;
    group.setAttribute("aria-busy", String(value));
    for (const button of list.children) button.disabled = value;
  }

  function render(shortcuts) {
    const favorites = shortcuts.filter((app) => app.favorite);
    const snapshot = JSON.stringify(favorites);
    if (snapshot === rendered) return;
    rendered = snapshot;
    const focusedId = list.contains(document.activeElement)
      ? document.activeElement.dataset.shortcutId
      : null;
    list.replaceChildren();
    for (const app of favorites) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rail-favorite";
      button.dataset.shortcutId = app.id;
      button.setAttribute("aria-label", `Open favorite ${app.title}`);
      button.title = app.title;
      button.disabled = busy;
      const mark = appIcon(app, "rail-favorite-mark");
      const label = document.createElement("span");
      label.className = "rail-favorite-name";
      label.textContent = app.title;
      button.append(mark, label);
      button.addEventListener("click", () => {
        close();
        onLaunch(app);
      });
      list.append(button);
    }
    group.classList.toggle("hidden", !favorites.length);
    toggle.classList.toggle("hidden", !favorites.length);
    if (!favorites.length) close();
    select(selectedId);
    setOpenIds([...openIds]);
    if (focusedId) {
      const next =
        [...list.children].find(
          (button) => button.dataset.shortcutId === focusedId,
        ) || list.firstElementChild;
      (next || document.querySelector('.rail-link[data-view="apps"]')).focus();
    }
  }

  toggle.addEventListener("click", () => {
    if (rail.classList.contains("favorites-open")) close();
    else {
      rail.classList.add("favorites-open");
      toggle.setAttribute("aria-expanded", "true");
      (
        list.querySelector('[aria-current="true"]') || list.firstElementChild
      )?.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!rail.contains(event.target)) close();
  });
  mobile.addEventListener("change", () => close());

  return {
    render,
    select,
    setBusy,
    setOpenIds,
    close,
    isOpen: () => mobile.matches && rail.classList.contains("favorites-open"),
  };
}
