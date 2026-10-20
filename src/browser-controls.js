import "./browser-controls.css";
import { invoke, native } from "./native.js";

const status = document.querySelector("#browser-status");
let busy = false;
async function refresh() {
  if (!native) {
    status.textContent =
      "Browser preview: native service windows require the installed Windows app.";
    return;
  }
  if (busy) return;
  try {
    const current = await invoke("browser_status");
    if (!current) {
      status.textContent = "No website is open. Return to AURA Home.";
      return;
    }
    document.querySelector("#service-title").textContent = current.title;
    document.querySelector("#service-origin").textContent = current.origin;
    document.querySelector("#service-origin").title = current.origin;
    status.textContent = current.message;
  } catch {
    status.textContent =
      "AURA controls are unavailable. Close the service window to return Home.";
  }
}
for (const action of ["home", "retry", "external"]) {
  document
    .querySelector(`#browser-${action}`)
    .addEventListener("click", async () => {
      if (!native) {
        status.textContent =
          "These controls work in the installed Windows app.";
        return;
      }
      if (busy) return;
      busy = true;
      try {
        await invoke(`browser_${action}`);
      } catch (error) {
        status.textContent = `Unable to ${action}: ${String(error)}`;
      } finally {
        busy = false;
      }
    });
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelector("#browser-home").click();
});
refresh();
setInterval(refresh, 1000);
