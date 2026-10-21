import "./style.css";
import { appIcon, readUploadedIcon } from "./components/app-icon.js";
import { native, invoke, getCurrentWindow, listen } from "./native.js";
import { targetKind, websiteUrl } from "./services/targets.js";
import { defaults } from "./services/defaults.js";
import {
  loadShortcuts,
  saveShortcuts,
  readPreference,
  normalizeShortcut,
} from "./services/shortcuts.js";
import { launchRoute, routeLabel } from "./services/launch-router.js";
import { setupUsage } from "./components/usage-panel.js";
import { setupFavoritesRail } from "./components/favorites-rail.js";
import { setupOpenApps } from "./components/open-apps.js";

const ACCENT_KEY = "aura-accent-v1";
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const repository = loadShortcuts(storage, defaults);
let apps = repository.shortcuts;
let editingId = null;
let pendingIcon = null;
let iconReading = false;
let iconRequest = 0;
let dialogTrigger = null;
let pendingLaunch = null;
let launching = false;
let homeNavigationReady = !native;
let browsing = false;
let browserContext = null;
let browserActionBusy = false;
let favoriteLaunchBusy = false;
let browserEntry = 0;
let browserTransition = null;
let browserRefreshBusy = false;
let queuedBrowserView = null;
let returnView = "home";
let view = "home";
let query = "";
let toastHandle;
const usage = setupUsage({
  storage,
  getShortcuts: () => apps,
  getBrowser: () => browserContext,
  native,
  invoke,
});
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const favoritesRail = setupFavoritesRail({ onLaunch: launchFavorite });
const openApps = setupOpenApps({
  native,
  invoke,
  getShortcuts: () => apps,
  onResume: resumeSession,
  onNotice: toast,
  onChange: (items) =>
    favoritesRail.setOpenIds(items.map((app) => app.shortcutId)),
});
const accent = readPreference(storage, ACCENT_KEY, "sand");
document.documentElement.dataset.accent = ["sand", "blue", "green"].includes(
  accent,
)
  ? accent
  : "sand";

function storageNotice(message) {
  const banner = $("#storage-notice");
  banner.textContent = message;
  banner.classList.toggle("hidden", !message);
}
function save() {
  try {
    saveShortcuts(storage, apps, repository.canSave);
  } catch {
    storageNotice(
      "Changes stay in this session. Existing saved settings are preserved; local storage is unavailable.",
    );
  }
}
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toastHandle);
  toastHandle = setTimeout(() => el.classList.add("hidden"), 3600);
}
function validTarget(target) {
  return Boolean(targetKind(target.trim()));
}
function launchFeedback(app, message) {
  pendingLaunch = app;
  $("#launch-message").textContent = message;
  $("#launch-feedback").classList.remove("hidden");
  $(".app-shell").inert = true;
  $("#fallback-home").focus();
}
function closeFeedback() {
  $("#launch-feedback").classList.add("hidden");
  $(".app-shell").inert = false;
  $("#add-shortcut").focus();
}
async function launch(app, mode) {
  if (launching) return;
  const shortcut = mode ? { ...app, launchMode: mode } : app;
  let transition = null;
  try {
    const route = launchRoute(shortcut);
    if (native && route.mode === "internal" && !homeNavigationReady)
      throw new Error(
        "The Home navigation channel is not ready. Restart AURA, or use Open externally.",
      );
    if (!native && route.mode === "internal") {
      launchFeedback(
        shortcut,
        "This browser preview cannot open a website inside AURA. Use Open externally, or run the Windows application.",
      );
      return;
    }
    if (!native && shortcut.kind !== "website") {
      launchFeedback(
        shortcut,
        "Windows applications and media files require the installed Windows application.",
      );
      return;
    }
    launching = true;
    if (native && route.mode === "internal")
      transition = beginBrowserLoading(shortcut);
    if (native) {
      const result = await invoke("launch_shortcut", {
        target: shortcut.target,
        title: shortcut.title,
        kind: shortcut.kind,
        launchMode: shortcut.launchMode,
        allowHttp: shortcut.allowHttp,
        shortcutId: shortcut.id,
      });
      if (!result.resumed) usage.launch(shortcut, result.mode);
      openApps.refresh();
      if (transition) {
        transition.returning = Boolean(result.resumed);
        transition.opening = false;
        if (queuedBrowserView === null) await refreshBrowser();
      }
      if (result.mode !== "internal") toast(result.reason);
    } else {
      window.open(shortcut.target, "_blank", "noopener,noreferrer");
      usage.launch(shortcut, "external");
      toast(route.reason + " Browser preview: opened a separate tab.");
    }
  } catch (error) {
    if (transition) {
      // A failed native close leaves the old child usable. Never put a local
      // modal underneath it or count the failed replacement as a launch.
      const current = await invoke("browser_status").catch(() => null);
      endBrowserLoading();
      if (current) {
        const restored = beginBrowserLoading({
          id: current.shortcutId,
          title: current.title,
        });
        restored.opening = false;
        await refreshBrowser();
        browserStatus(`Unable to switch: ${String(error)}`, true);
        toast(`Unable to switch to ${shortcut.title}. ${String(error)}`);
      } else {
        leaveBrowser();
        setView("home");
        launchFeedback(shortcut, String(error));
      }
    } else launchFeedback(shortcut, String(error));
  } finally {
    launching = false;
    if (queuedBrowserView !== null) {
      const destination = queuedBrowserView;
      queuedBrowserView = null;
      if (browsing) await browserAction("home", destination);
      else setView(destination);
    }
  }
}
async function launchFavorite(app) {
  if (favoriteLaunchBusy || launching || browserActionBusy) return;
  if (
    browsing &&
    (browserContext?.shortcutId === app.id ||
      browserTransition?.shortcutId === app.id)
  )
    return;
  favoriteLaunchBusy = true;
  favoritesRail.setBusy(true);
  try {
    // Internal launches keep the old page; external shortcuts park it first.
    if (
      browsing &&
      launchRoute(app).mode !== "internal" &&
      !(await browserAction("home"))
    )
      return;
    await launch(app);
  } finally {
    favoriteLaunchBusy = false;
    favoritesRail.setBusy(false);
  }
}
$("#fallback-home").addEventListener("click", () => {
  closeFeedback();
  setView("home");
});
$("#fallback-retry").addEventListener("click", () => {
  const app = pendingLaunch;
  closeFeedback();
  launch(app);
});
$("#fallback-external").addEventListener("click", () => {
  const app = pendingLaunch;
  closeFeedback();
  launch(app, "external");
});
function tile(app) {
  const card = document.createElement("article");
  card.className = "app-card";
  card.dataset.shortcutId = app.id;
  card.style.setProperty("--tile-color", app.color || "#32485b");
  const button = document.createElement("button");
  button.className = "tile";
  button.type = "button";
  button.setAttribute("aria-label", `Launch ${app.title}`);
  const foot = document.createElement("span");
  foot.className = "tile-foot";
  const name = document.createElement("span");
  name.className = "tile-name";
  name.textContent = app.title;
  const type = document.createElement("span");
  type.className = "tile-type";
  type.textContent =
    app.category === "music"
      ? "MUSIC"
      : app.category === "video"
        ? "MOVIES & TV"
        : "SHORTCUT";
  foot.append(name, type);
  const mode = document.createElement("span");
  mode.className = "tile-mode";
  mode.textContent = routeLabel(app);
  try {
    button.title = launchRoute(app).reason;
  } catch (error) {
    button.title = String(error);
  }
  button.append(appIcon(app, "tile-logo"), foot, mode);
  button.addEventListener("click", () => launch(app));
  const controls = document.createElement("div");
  controls.className = "tile-controls";
  const star = document.createElement("button");
  star.className = "tile-star" + (app.favorite ? "" : " off");
  star.type = "button";
  star.title = app.favorite ? "Remove from favorites" : "Add to favorites";
  star.setAttribute("aria-label", star.title);
  star.setAttribute("aria-pressed", String(app.favorite));
  star.textContent = app.favorite ? "★" : "☆";
  star.addEventListener("click", () => {
    const grid = card.parentElement.id;
    const index = [...card.parentElement.children].indexOf(card);
    app.favorite = !app.favorite;
    save();
    render();
    const cards = [
      ...document.getElementById(grid).querySelectorAll(".app-card"),
    ];
    (
      cards
        .find((c) => c.dataset.shortcutId === app.id)
        ?.querySelector(".tile-star") ||
      cards[Math.min(index, cards.length - 1)]?.querySelector(".tile-star") ||
      $("#add-shortcut")
    ).focus();
    toast(
      `${app.title} ${app.favorite ? "added to" : "removed from"} favorites`,
    );
  });
  const menu = document.createElement("details");
  menu.className = "card-menu";
  const toggle = document.createElement("summary");
  toggle.textContent = "•••";
  toggle.setAttribute("aria-label", `Options for ${app.title}`);
  const panel = document.createElement("div");
  panel.className = "card-menu-panel";
  const action = (label, text, callback) => {
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = text;
    control.setAttribute("aria-label", label);
    control.addEventListener("click", () => {
      menu.open = false;
      toggle.focus();
      callback();
    });
    panel.append(control);
  };
  action(`Edit ${app.title}`, "Edit shortcut", () => openDialog(app));
  action(`Launch options for ${app.title}`, "Launch options", () => {
    openDialog(app);
    $("#shortcut-mode").focus();
  });
  action(`Remove ${app.title}`, "Remove shortcut", () => {
    if (!confirm(`Remove ${app.title} shortcut?`)) return;
    apps = apps.filter((a) => a.id !== app.id);
    save();
    render();
    $("#add-shortcut").focus();
    toast("Shortcut removed");
  });
  menu.addEventListener("toggle", () => {
    toggle.setAttribute("aria-expanded", String(menu.open));
    if (menu.open)
      document.querySelectorAll(".card-menu[open]").forEach((other) => {
        if (other !== menu) other.open = false;
      });
  });
  toggle.setAttribute("aria-expanded", "false");
  menu.append(toggle, panel);
  controls.append(star, menu);
  card.append(button, controls);
  return card;
}
document.addEventListener("click", (event) => {
  document.querySelectorAll(".card-menu[open]").forEach((menu) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape")
    document.querySelectorAll(".card-menu[open]").forEach((menu) => {
      menu.open = false;
      menu.querySelector("summary").focus();
      event.stopImmediatePropagation();
    });
});
function render() {
  favoritesRail.render(apps);
  const fav = $("#favorites");
  const all = $("#all-apps");
  fav.replaceChildren();
  all.replaceChildren();
  const matches = (a) =>
    a.title.toLowerCase().includes(query) ||
    a.category.toLowerCase().includes(query);
  const favoriteApps = apps.filter((a) => a.favorite && matches(a));
  if (!favoriteApps.length) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "No favorites yet. Add a shortcut using the + button.";
    fav.append(e);
  } else favoriteApps.forEach((a) => fav.append(tile(a)));
  const filtered = apps.filter(matches);
  if (!filtered.length) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "No matching shortcuts.";
    all.append(e);
  } else filtered.forEach((a) => all.append(tile(a)));
  $("#app-count").textContent =
    `${filtered.length} shortcut${filtered.length === 1 ? "" : "s"}`;
  $$(".swatch").forEach((x) =>
    x.classList.toggle(
      "selected",
      x.dataset.accent === document.documentElement.dataset.accent,
    ),
  );
}
function setView(next) {
  view = next;
  $$(".view").forEach((x) =>
    x.classList.toggle("active", x.id === `${view}-view`),
  );
  $$("[data-view]").forEach((x) => {
    if (x.classList.contains("rail-link"))
      x.classList.toggle("selected", x.dataset.view === view);
  });
  $("#page-heading").textContent = {
    home: "Home",
    apps: "Applications",
    library: "Library",
    settings: "Settings",
    open: "Open apps",
  }[view];
  $("#search-area").classList.add("hidden");
  query = "";
  $("#search-box").value = "";
  render();
  if (next === "settings") usage.render();
  if (next === "open") openApps.refresh();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function leaveBrowser() {
  browserEntry++;
  endBrowserLoading();
  browserContext = null;
  favoritesRail.select(null);
  usage.contextChanged();
  browsing = false;
  document.body.classList.remove("browsing");
  $("#browser-workspace").classList.add("hidden");
  openApps.refresh();
}

async function resumeSession(app) {
  if (launching || browserActionBusy || favoriteLaunchBusy) return;
  launching = true;
  const transition = beginBrowserLoading({
    id: app.shortcutId,
    title: app.title,
  });
  transition.returning = true;
  $("#browser-loading-title").textContent = `Returning to ${app.title}`;
  try {
    await invoke("browser_resume", { sessionId: app.sessionId });
    transition.opening = false;
    if (queuedBrowserView === null) await refreshBrowser();
  } catch (error) {
    leaveBrowser();
    setView("open");
    toast(`Unable to return to ${app.title}. ${String(error)}`);
  } finally {
    launching = false;
    if (queuedBrowserView !== null) {
      const destination = queuedBrowserView;
      queuedBrowserView = null;
      if (browsing) await browserAction("home", destination);
      else setView(destination);
    }
    openApps.refresh();
  }
}
function beginBrowserLoading(app) {
  browserEntry++;
  browserTransition = { shortcutId: app.id, opening: true };
  $("#toast").classList.add("hidden");
  browserContext = null;
  usage.contextChanged();
  browsing = true;
  returnView = "home";
  document.body.classList.add("browsing");
  $("#browser-workspace").classList.remove("hidden");
  $("#service-title").textContent = app.title;
  favoritesRail.select(app.id);
  $$(".rail-link").forEach((button) => button.classList.remove("selected"));
  $("#browser-loading-title").textContent = `Opening ${app.title}`;
  $("#browser-loading-detail").textContent = "Your next moment is on its way.";
  $("#browser-loading").classList.remove("hidden", "is-stalled");
  $("#browser-loading").setAttribute("aria-busy", "true");
  $("#browser-retry").disabled = true;
  browserStatus(`Opening ${app.title}.`);
  return browserTransition;
}
function endBrowserLoading() {
  browserTransition = null;
  $("#browser-loading").classList.add("hidden");
  $("#browser-loading").setAttribute("aria-busy", "false");
  $("#browser-retry").disabled = browserActionBusy;
}
function browserStatus(message, attention = false) {
  $("#browser-status").textContent = message;
  const refresh = $("#browser-retry");
  refresh.title = attention ? `Refresh website. ${message}` : "Refresh website";
  refresh.classList.toggle("needs-attention", attention);
}
async function refreshBrowser() {
  if (!native || !browsing || browserRefreshBusy || browserTransition?.opening)
    return;
  browserRefreshBusy = true;
  const entry = browserEntry;
  const transition = browserTransition;
  try {
    const current = await invoke("browser_status");
    if (!browsing || entry !== browserEntry || transition !== browserTransition)
      return;
    if (!current) {
      leaveBrowser();
      setView("home");
      return;
    }
    if (browserContext?.sessionId !== current.sessionId) usage.contextChanged();
    browserContext = current;
    favoritesRail.select(current.shortcutId);
    $("#service-title").textContent = current.title;
    browserStatus(current.message, ["blocked", "slow"].includes(current.phase));
    if (transition) {
      $("#browser-loading-title").textContent =
        `${transition.returning ? "Returning to" : "Opening"} ${current.title}`;
      $("#browser-retry").disabled = browserActionBusy;
      const stalled = ["blocked", "slow"].includes(current.phase);
      $("#browser-loading").classList.toggle("is-stalled", stalled);
      $("#browser-loading").setAttribute("aria-busy", String(!stalled));
      $("#browser-loading-detail").textContent = stalled
        ? current.message
        : "Your next moment is on its way.";
      if (current.ready ?? current.phase === "received") {
        await invoke("browser_reveal", { sessionId: current.sessionId });
        if (entry === browserEntry && transition === browserTransition)
          endBrowserLoading();
      }
    }
  } catch {
    if (!browsing || entry !== browserEntry) return;
    browserStatus(
      "Website controls are unavailable. Use Home in the sidebar, or close AURA and reopen it.",
      true,
    );
    if (transition === browserTransition && transition) {
      $("#browser-loading").classList.add("is-stalled");
      $("#browser-loading").setAttribute("aria-busy", "false");
      $("#browser-loading-detail").textContent =
        "We couldn't display this website. Use refresh to try again, or choose Home in the sidebar.";
      $("#browser-retry").disabled = false;
    }
  } finally {
    browserRefreshBusy = false;
  }
}
function enterBrowser() {
  if (!browserTransition) {
    const transition = beginBrowserLoading({ title: "your app" });
    transition.opening = false;
  } else browserEntry++;
  browsing = true;
  returnView = "home";
  document.body.classList.add("browsing");
  $("#browser-workspace").classList.remove("hidden");
  $$(".rail-link").forEach((button) => button.classList.remove("selected"));
  $("#browser-retry").focus();
  refreshBrowser();
}
async function browserAction(action, destination = "home") {
  if (!browsing || browserActionBusy) return false;
  browserActionBusy = true;
  returnView = destination;
  $("#browser-retry").disabled = true;
  try {
    await invoke(`browser_${action}`);
    if (action !== "retry") {
      leaveBrowser();
      setView(destination);
      if (destination === "home") $("#hero-browse").focus();
    } else await refreshBrowser();
    return true;
  } catch (error) {
    browserStatus(
      `Unable to ${action === "retry" ? "refresh" : "return"}: ${String(error)}`,
      true,
    );
    return false;
  } finally {
    browserActionBusy = false;
    $("#browser-retry").disabled = false;
  }
}
$("#browser-retry").addEventListener("click", () => browserAction("retry"));
setInterval(refreshBrowser, 1000);
setInterval(() => openApps.refresh(), 1500);
openApps.refresh();
$$("[data-view]").forEach((b) =>
  b.addEventListener("click", () => {
    favoritesRail.close();
    if (launching && browsing) {
      queuedBrowserView = b.dataset.view;
      return;
    }
    if (browsing) browserAction("home", b.dataset.view);
    else setView(b.dataset.view);
  }),
);
function openDialog(app) {
  iconRequest++;
  iconReading = false;
  $("#shortcut-form button[type=submit]").disabled = false;
  dialogTrigger = document.activeElement;
  editingId = app?.id || null;
  pendingIcon = app?.icon || null;
  $("#icon-status").textContent = pendingIcon
    ? "Custom icon saved"
    : "Automatic logo or monogram";
  $("#shortcut-form").reset();
  $("#dialog-title").textContent = editingId
    ? "Edit shortcut"
    : "Add a shortcut";
  if (editingId) {
    $("#shortcut-title").value = app.title;
    $("#shortcut-target").value = app.target;
    $("#shortcut-category").value = app.category;
    $("#shortcut-favorite").checked = app.favorite;
    $("#shortcut-mode").value = app.launchMode;
    $("#shortcut-http").checked = app.allowHttp;
  }
  $("#dialog-backdrop").classList.remove("hidden");
  $(".app-shell").inert = true;
  $("#shortcut-title").focus();
}
function closeDialog() {
  iconRequest++;
  $("#dialog-backdrop").classList.add("hidden");
  $("#shortcut-form").reset();
  $(".app-shell").inert = false;
  (dialogTrigger?.isConnected ? dialogTrigger : $("#add-shortcut")).focus();
  editingId = null;
}
$$("#add-shortcut,#apps-add,#library-add,#settings-add").forEach((button) =>
  button.addEventListener("click", () => openDialog()),
);
$("#hero-browse").addEventListener("click", () => setView("apps"));
$("#hero-configure").addEventListener("click", () => setView("settings"));
$("#customize").addEventListener("click", () => setView("settings"));
$("#close-dialog").addEventListener("click", closeDialog);
$("#dialog-backdrop").addEventListener("click", (e) => {
  if (e.target.id === "dialog-backdrop") closeDialog();
});
$("#shortcut-icon").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const request = ++iconRequest;
  iconReading = true;
  $("#icon-status").textContent = "Preparing icon…";
  const submit = $("#shortcut-form button[type=submit]");
  submit.disabled = true;
  try {
    const icon = await readUploadedIcon(file);
    if (request !== iconRequest) return;
    pendingIcon = icon;
    $("#icon-status").textContent = "Custom icon ready";
  } catch (error) {
    if (request !== iconRequest) return;
    $("#icon-status").textContent = String(error.message || error);
  } finally {
    if (request === iconRequest) {
      iconReading = false;
      submit.disabled = false;
      event.target.value = "";
    }
  }
});
$("#reset-icon").addEventListener("click", () => {
  iconRequest++;
  iconReading = false;
  $("#shortcut-form button[type=submit]").disabled = false;
  pendingIcon = null;
  $("#icon-status").textContent = "Automatic logo or monogram";
});
$("#shortcut-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (iconReading) return;
  const title = $("#shortcut-title").value.trim();
  const target = $("#shortcut-target").value.trim();
  if (!title || !validTarget(target)) {
    toast(
      "Enter a name and valid http(s) URL or absolute Windows application path.",
    );
    return;
  }
  const colors = [
    "#4e3d38",
    "#284953",
    "#314b3b",
    "#64472e",
    "#313f62",
    "#654256",
  ];
  const previous = apps.find((app) => app.id === editingId);
  const shortcut = normalizeShortcut({
    ...previous,
    icon: pendingIcon,
    id: editingId || crypto.randomUUID(),
    title,
    target,
    kind: targetKind(target),
    category: $("#shortcut-category").value,
    favorite: $("#shortcut-favorite").checked,
    launchMode: $("#shortcut-mode").value,
    allowHttp: $("#shortcut-http").checked,
    color: previous?.color || colors[apps.length % colors.length],
    mark: previous?.mark || title.slice(0, 1).toUpperCase(),
  });
  if (shortcut.kind === "website" && !websiteUrl(target, shortcut.allowHttp)) {
    toast(
      "HTTP is unencrypted. Explicitly allow HTTP for this shortcut or use HTTPS.",
    );
    return;
  }
  if (previous)
    apps = apps.map((app) => (app.id === editingId ? shortcut : app));
  else apps.push(shortcut);
  save();
  render();
  closeDialog();
  toast(previous ? "Shortcut updated" : "Shortcut added");
});
$("#search-toggle").addEventListener("click", () => {
  if (view !== "apps" && view !== "home") setView("apps");
  $("#search-area").classList.toggle("hidden");
  if (!$("#search-area").classList.contains("hidden")) $("#search-box").focus();
});
$("#search-box").addEventListener("input", (e) => {
  query = e.target.value.trim().toLowerCase();
  render();
});
$$(".swatch").forEach((b) =>
  b.addEventListener("click", () => {
    document.documentElement.dataset.accent = b.dataset.accent;
    try {
      storage.setItem(ACCENT_KEY, b.dataset.accent);
    } catch {
      storageNotice(
        "Accent changes stay in this session; local storage is unavailable.",
      );
    }
    render();
  }),
);
$("#toggle-fullscreen").addEventListener("click", async () => {
  try {
    if (native) {
      const win = getCurrentWindow();
      await invoke("app_fullscreen", { value: !(await win.isFullscreen()) });
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch (err) {
    toast(`Fullscreen unavailable: ${err}`);
  }
});
$("#exit-app").addEventListener("click", async () => {
  try {
    if (native) {
      usage.flush();
      await getCurrentWindow().close();
    } else {
      toast("Close this browser tab to leave the preview.");
    }
  } catch (err) {
    toast(`Unable to exit: ${err}`);
  }
});
function updateClock() {
  const d = new Date();
  $("#clock").textContent = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  $("#date").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
}
updateClock();
setInterval(updateClock, 15000);
// Remote/gamepad-like directional keyboard navigation across visible controls.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && favoritesRail.isOpen()) {
    favoritesRail.close({ restoreFocus: true });
    e.preventDefault();
    return;
  }
  if (browsing && e.key === "Escape") {
    browserAction("home");
    return;
  }
  const dialog = $$(".dialog-backdrop:not(.hidden) .dialog")[0];
  if (dialog) {
    if (e.key === "Escape") {
      if (!$("#launch-feedback").classList.contains("hidden")) closeFeedback();
      else closeDialog();
      return;
    }
    if (e.key === "Tab") {
      const focusable = [
        ...dialog.querySelectorAll("button, input, select"),
      ].filter((el) => !el.disabled);
      const first = focusable[0],
        last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      }
      if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
    return;
  }
  if (
    e.key === "Escape" &&
    !$("#dialog-backdrop").classList.contains("hidden")
  ) {
    closeDialog();
    return;
  }
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
    return;
  const a = document.activeElement;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(a?.tagName)) return;
  const controls = $$("button:not([disabled]), summary").filter(
    (el) =>
      (el.getClientRects().length &&
        el.closest(".view")?.classList.contains("active")) ||
      (el.getClientRects().length &&
        !el.closest(".view") &&
        !el.closest(".dialog")),
  );
  if (!controls.length) return;
  const rect = a?.getBoundingClientRect?.();
  if (!rect || !controls.includes(a)) {
    controls[0].focus();
    e.preventDefault();
    return;
  }
  const cx = rect.left + rect.width / 2,
    cy = rect.top + rect.height / 2;
  const candidates = controls
    .filter((el) => el !== a)
    .map((el) => {
      const r = el.getBoundingClientRect(),
        dx = r.left + r.width / 2 - cx,
        dy = r.top + r.height / 2 - cy;
      const inDir = {
        ArrowRight: dx > 5,
        ArrowLeft: dx < -5,
        ArrowDown: dy > 5,
        ArrowUp: dy < -5,
      }[e.key];
      return { el, dx, dy, inDir };
    })
    .filter((x) => x.inDir);
  candidates.sort((a, b) => {
    const horiz = e.key === "ArrowLeft" || e.key === "ArrowRight";
    const as = horiz
      ? Math.abs(a.dx) + 2 * Math.abs(a.dy)
      : Math.abs(a.dy) + 2 * Math.abs(a.dx);
    const bs = horiz
      ? Math.abs(b.dx) + 2 * Math.abs(b.dy)
      : Math.abs(b.dy) + 2 * Math.abs(b.dx);
    return as - bs;
  });
  if (candidates[0]) {
    candidates[0].el.focus();
    candidates[0].el.scrollIntoView({ block: "nearest", inline: "nearest" });
    e.preventDefault();
  }
});
render();

storageNotice(repository.notice);
if (native) {
  Promise.all([
    listen("aura-home", async () => {
      if (browserTransition) return;
      const entry = browserEntry;
      // A favorite can open a new session before an old Home event arrives.
      // Never let that delayed event hide the newly opened browser workspace.
      try {
        if (
          (await invoke("browser_status")) ||
          entry !== browserEntry ||
          browserTransition
        )
          return;
      } catch {
        if (entry !== browserEntry) return;
      }
      leaveBrowser();
      setView(returnView);
      if (returnView === "home") $("#hero-browse").focus();
      returnView = "home";
    }),
    listen("aura-browser", enterBrowser),
  ])
    .then(async () => {
      homeNavigationReady = true;
      if (await invoke("browser_status")) enterBrowser();
    })
    .catch(() =>
      toast(
        "Home navigation events are unavailable. Restart AURA before opening a website.",
      ),
    );
}
