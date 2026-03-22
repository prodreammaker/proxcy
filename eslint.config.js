import globals from "globals";

export default [
  {
    files: ["**/*.js"],
    ignores: ["node_modules/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.worker,
        WebSocketPair: "readonly",
        addEventListener: "readonly",
        console: "readonly",
        crypto: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        Response: "readonly",
        URL: "readonly",
        ReadableStream: "readonly",
        WritableStream: "readonly",
        Uint8Array: "readonly",
        DataView: "readonly",
        ArrayBuffer: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
    },
  },
];
