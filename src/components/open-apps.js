export function setupOpenApps({
  native,
  invoke,
  getShortcuts,
  onResume,
  onNotice,
  onChange,
}) {
  const list = document.querySelector("#open-app-list");
  const count = document.querySelector("#open-app-count");
  const empty = document.querySelector("#open-app-empty");
  const notice = document.querySelector("#open-app-notice");
  let snapshot = "";
  let refreshing = false;
  let busy = false;

  async function refresh() {
    if (!native || refreshing) return;
    refreshing = true;
    try {
      const result = await invoke("browser_sessions");
      const items = result?.items || [];
      onChange(items);
      count.textContent = String(items.length);
      count.classList.toggle("hidden", !items.length);
      document
        .querySelector(".open-apps-link")
        .setAttribute("aria-description", `${items.length} apps kept open`);
      notice.textContent = `Keep up to ${result?.limit || 6} apps open until you close them or exit AURA. Background audio is muted. Pause the site's player before switching to keep your playback position.`;
      const shortcuts = getShortcuts();
      const next = JSON.stringify([
        items,
        shortcuts.map(({ id, color, mark }) => ({ id, color, mark })),
      ]);
      if (next === snapshot) return;
      snapshot = next;
      const focused = list.contains(document.activeElement)
        ? {
            id: document.activeElement.dataset.sessionId,
            action: document.activeElement.dataset.action,
          }
        : null;
      list.replaceChildren();
      for (const app of items) {
        const shortcut = shortcuts.find((s) => s.id === app.shortcutId);
        const card = document.createElement("article");
        card.className = "open-app-card";
        card.dataset.sessionId = String(app.sessionId);
        const mark = document.createElement("span");
        mark.className = "open-app-mark";
        mark.textContent = shortcut?.mark || app.title[0] || "A";
        mark.style.backgroundColor = shortcut?.color || "#284b69";
        mark.setAttribute("aria-hidden", "true");
        const info = document.createElement("div");
        info.className = "open-app-info";
        const title = document.createElement("h3");
        title.textContent = app.title;
        const state = document.createElement("p");
        state.textContent = app.active
          ? "Active"
          : app.sleeping
            ? "Sleeping · audio muted"
            : "Kept open · audio muted";
        info.append(title, state);
        const actions = document.createElement("div");
        actions.className = "open-app-actions";
        for (const action of ["resume", "close"]) {
          const button = document.createElement("button");
          button.className = action === "resume" ? "primary" : "quiet";
          button.textContent =
            action === "resume" ? "Return to app ↗" : "Close";
          button.setAttribute(
            "aria-label",
            `${action === "resume" ? "Return to" : "Close"} ${app.title}`,
          );
          button.dataset.sessionId = String(app.sessionId);
          button.dataset.action = action;
          button.disabled = busy;
          button.addEventListener("click", async () => {
            if (busy) return;
            busy = true;
            for (const control of list.querySelectorAll("button"))
              control.disabled = true;
            try {
              if (action === "resume") await onResume(app);
              else await invoke("browser_close", { sessionId: app.sessionId });
            } catch (error) {
              onNotice(
                `Unable to ${action === "resume" ? "resume" : "close"} ${app.title}. ${String(error)}`,
              );
            } finally {
              busy = false;
              await refresh();
              for (const control of list.querySelectorAll("button"))
                control.disabled = false;
              if (action === "close")
                (
                  list.querySelector("button") ||
                  document.querySelector('[data-view="open"]')
                ).focus();
            }
          });
          actions.append(button);
        }
        card.append(mark, info, actions);
        list.append(card);
      }
      empty.classList.toggle("hidden", items.length > 0);
      if (focused) {
        const replacement = [...list.querySelectorAll("button")].find(
          (button) =>
            button.dataset.sessionId === focused.id &&
            button.dataset.action === focused.action,
        );
        replacement?.focus();
      }
    } catch {
      notice.textContent =
        "Open apps are unavailable right now. Try this view again, or restart AURA.";
    } finally {
      refreshing = false;
    }
  }
  if (!native)
    notice.textContent =
      "Keeping apps open requires the Windows application. The browser preview does not host internal sites.";
  return { refresh };
}
