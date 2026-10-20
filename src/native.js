import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
export { listen } from "@tauri-apps/api/event";

export const native = isTauri();
export { invoke, getCurrentWindow };
