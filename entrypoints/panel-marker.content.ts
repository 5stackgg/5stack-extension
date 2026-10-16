import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";

// Tells the 5Stack panel the extension is installed, so it can stop
// offering it. A data attribute, set before the app boots, is all it reads.
export default defineContentScript({
  matches: ["https://5stack.gg/*"],
  runAt: "document_start",
  main() {
    document.documentElement.dataset["5stackExtension"] =
      browser.runtime.getManifest().version;
  },
});
