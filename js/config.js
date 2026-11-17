/* config.js - the one file you edit to choose where live progress is stored.

   Leave "endpoint" empty and the app tries free public stores (MantleDB first, then jsonstorage.net), each with a private random
   item per trip and no account. They are third-party services, so they can change their rules or disappear.

   For the most reliable setup, deploy worker/worker.js once on your own free Cloudflare account (steps in the README),
   then paste its address here, for example "https://trip-sync.yourname.workers.dev". Your users still need no account. */
export const SYNC = {
  endpoint: ""
};
