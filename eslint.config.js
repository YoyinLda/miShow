import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommended, {
  ignores: [
    "node_modules/**",
    ".local/research/**",
    "**/.next/**",
    "**/out/**",
    "**/dist/**",
    "**/*.d.ts"
  ]
}, {
  files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  rules: { "@typescript-eslint/no-explicit-any": "off" }
}, {
  // Scripts de CI en Node puro (.mjs, sin dependencias): globals del runtime.
  files: [".github/scripts/**/*.mjs"],
  languageOptions: {
    globals: {
      process: "readonly",
      console: "readonly",
      fetch: "readonly",
      URL: "readonly",
      URLSearchParams: "readonly",
      setTimeout: "readonly",
      clearTimeout: "readonly"
    }
  }
});
