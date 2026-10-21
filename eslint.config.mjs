export default [
  { ignores: ["**/*.ts", "**/*.tsx", "node_modules/**", ".next/**"] },
  {
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: {
      "no-debugger": "error",
      "no-unreachable": "error",
      "no-constant-condition": "error",
    },
  },
];
