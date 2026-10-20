import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".tools/**",
      "src-tauri/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  { files: ["src/services/targets.js"], rules: { "no-control-regex": "off" } },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
];
