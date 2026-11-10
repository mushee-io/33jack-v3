import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        medusa: resolve(import.meta.dirname, "medusa-jf4.html"),
      },
    },
  },
});
