import { UsageTracker, usageDuration } from "../services/usage.js";

export function setupUsage({
  storage,
  getShortcuts,
  getBrowser,
  native,
  invoke,
}) {
  const tracker = new UsageTracker(storage);
  const $ = (selector) => document.querySelector(selector);
  let sampling = false;
  let generation = 0;
  let timingNotice = "";

  function render() {
    const data = tracker.snapshot();
    $("#usage-enabled").checked = data.enabled;
    $("#usage-enabled").disabled = !tracker.canSave;
    $("#usage-state").textContent = data.enabled
      ? "Tracking is on. Totals update while you use AURA."
      : "Tracking is paused. Existing history is kept; new launches and time are not recorded.";
    $("#usage-notice").textContent = tracker.notice || timingNotice;
    $("#usage-notice").classList.toggle(
      "hidden",
      !(tracker.notice || timingNotice),
    );
    $("#usage-aura").textContent = usageDuration(data.auraMs);
    $("#usage-sites").textContent = usageDuration(
      data.shortcuts.reduce((sum, s) => sum + s.internalMs, 0),
    );
    $("#usage-launches").textContent = String(
      data.shortcuts.reduce(
        (sum, s) => sum + s.internalLaunches + s.externalLaunches,
        0,
      ),
    );
    const names = new Map(getShortcuts().map((s) => [s.id, s.title]));
    const rows = data.shortcuts.sort(
      (a, b) =>
        b.internalMs - a.internalMs ||
        b.internalLaunches +
          b.externalLaunches -
          (a.internalLaunches + a.externalLaunches) ||
        a.title.localeCompare(b.title),
    );
    const body = $("#usage-rows");
    body.replaceChildren();
    for (const record of rows) {
      const row = document.createElement("tr");
      row.dataset.shortcutId = record.id;
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = names.get(record.id) || record.title;
      const launches = document.createElement("td");
      launches.textContent = String(
        record.internalLaunches + record.externalLaunches,
      );
      const modes = document.createElement("small");
      modes.textContent = `${record.internalLaunches} inside / ${record.externalLaunches} external`;
      launches.append(modes);
      const time = document.createElement("td");
      time.textContent =
        record.internalLaunches > 0 || record.internalMs > 0
          ? usageDuration(record.internalMs)
          : "Unavailable (external)";
      const last = document.createElement("td");
      last.textContent =
        record.lastOpenedAt === null
          ? "No tracked launch"
          : new Intl.DateTimeFormat(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(record.lastOpenedAt);
      row.append(name, launches, time, last);
      body.append(row);
    }
    $("#usage-empty").classList.toggle("hidden", rows.length > 0);
  }

  async function sample() {
    if (sampling || !tracker.enabled) return;
    sampling = true;
    const currentGeneration = generation;
    try {
      const focused = native
        ? await invoke("usage_foreground")
        : document.visibilityState === "visible" && document.hasFocus();
      if (generation !== currentGeneration) return;
      const browser = getBrowser();
      const shortcut = browser?.shortcutId
        ? { id: browser.shortcutId, title: browser.title }
        : null;
      tracker.sample({
        mono: performance.now(),
        wall: Date.now(),
        focused,
        shortcut,
        session: browser?.sessionId ?? null,
      });
      timingNotice = "";
    } catch {
      tracker.resetBaseline();
      timingNotice =
        "Foreground time is unavailable right now. Launch counts can still be recorded.";
    } finally {
      sampling = false;
      if ($("#settings-view").classList.contains("active")) render();
    }
  }
  function contextChanged() {
    generation++;
    tracker.resetBaseline();
  }
  $("#usage-enabled").addEventListener("change", (event) => {
    contextChanged();
    tracker.setEnabled(event.target.checked);
    render();
  });
  $("#usage-clear").addEventListener("click", () => {
    $("#usage-confirm").classList.remove("hidden");
    $("#usage-cancel").focus();
  });
  function closeConfirmation() {
    $("#usage-confirm").classList.add("hidden");
    $("#usage-clear").focus();
  }
  $("#usage-cancel").addEventListener("click", closeConfirmation);
  $("#usage-clear-confirm").addEventListener("click", () => {
    contextChanged();
    tracker.clear();
    closeConfirmation();
    render();
  });
  window.addEventListener("pagehide", () => tracker.flush());
  document.addEventListener("visibilitychange", () => {
    contextChanged();
    tracker.flush();
  });
  if (!native) window.addEventListener("blur", contextChanged);
  setInterval(sample, 1000);
  setInterval(() => {
    tracker.flush();
  }, 5000);
  render();
  sample();
  return {
    render,
    contextChanged,
    flush: () => tracker.flush(),
    launch: (shortcut, mode) => {
      tracker.launch(shortcut, mode);
      render();
    },
  };
}
