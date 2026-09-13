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
  files: ["**/*.ts", "**/*.js"],
  rules: { "@typescript-eslint/no-explicit-any": "off" }
});
