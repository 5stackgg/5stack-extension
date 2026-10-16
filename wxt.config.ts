import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-vue"],
  manifest: {
    name: "5Stack",
    description: "Import FACEIT and Leetify matches into your 5Stack panel.",
    permissions: ["sidePanel", "storage", "scripting"],
    host_permissions: [
      "https://www.faceit.com/*",
      "https://leetify.com/*",
      "https://api-public.cs-prod.leetify.com/*",
      "https://5stack.gg/*",
    ],
    optional_host_permissions: [
      "https://*/*",
      "http://localhost/*",
      "http://127.0.0.1/*",
    ],
    action: {
      default_title: "Import matches into 5Stack",
    },
  },
});
