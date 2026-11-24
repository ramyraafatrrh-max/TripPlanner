import config from "./config.js";
import { start } from "./core/kernel.js";
start(config).catch(e => { document.getElementById("app").textContent = "The app could not start: " + e.message; console.error(e); });
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
