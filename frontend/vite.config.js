import { defineConfig } from "vite";

// Vite configuration for the GenLayer Freelance Evaluator frontend.
// The app is a dependency-free single page app that talks to GenLayer
// through the official `genlayer-js` SDK.
export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
});
