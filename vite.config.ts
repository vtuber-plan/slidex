import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  root: "web",
  base: "/app/web/",
  plugins: [react(), tailwind()],
  build: {
    outDir: "../app/web",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("prosemirror") || id.includes("orderedmap"))
            return "richtext";
          if (id.includes("@radix-ui")) return "ui";
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/scheduler")
          )
            return "react";
        },
      },
    },
  },
  server: {
    proxy: { "/api": "http://127.0.0.1:4871", "/f": "http://127.0.0.1:4871" },
  },
});
