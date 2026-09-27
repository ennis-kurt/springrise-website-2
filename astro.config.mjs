import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import preact from "@astrojs/preact";

export default defineConfig({
  site: "https://springrise.org",
  output: "server",
  adapter: cloudflare({ imageService: "passthrough" }),
  integrations: [preact()],
  security: { checkOrigin: true },
  devToolbar: { enabled: false },
});
