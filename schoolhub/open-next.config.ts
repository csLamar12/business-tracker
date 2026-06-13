import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal configuration: run Next.js on Cloudflare Workers with the default
// (in-worker) caching. To enable persistent ISR/data caching later, wire up an
// R2 incremental cache and a KV/D1 tag cache here — see the OpenNext docs.
export default defineCloudflareConfig({});
