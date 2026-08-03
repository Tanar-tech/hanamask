import type { HanamaskPreloadApi } from "../../shared/preload-api.js";

declare global {
  interface Window {
    hanamask: HanamaskPreloadApi;
  }
}
