import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/.tools/**",
        "**/src-tauri/target/**",
        "**/src-tauri/gen/**",
        "**/test-results/**",
        "**/playwright-report/**",
      ],
    },
  },
  build: {
    rollupOptions: { input: { main: "index.html", browser: "browser.html" } },
  },
});
