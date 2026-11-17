/* config.js - the one file you edit to choose where live progress is stored.

   Leave "endpoint" empty to use the free public store jsonstorage.net. It needs no account, and the app creates a
   private random item for every trip by itself. It is a free third-party service, so it can change or disappear.

   For the most reliable setup, deploy worker/worker.js once on your own free Cloudflare account (steps in the README),
   then paste its address here, for example "https://trip-sync.yourname.workers.dev". Your users still need no account. */
export const SYNC = {
  endpoint: ""
};
