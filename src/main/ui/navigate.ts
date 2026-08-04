import type { NavigateTarget } from "../../shared/preload-api.js";

export interface UiNavigator {
  showWindow(): void;
  navigate(target: NavigateTarget): void;
}

// Injected from the entry point rather than importing electron here, so the MCP tools that
// call these stay testable outside an Electron runtime.
let navigator: UiNavigator | undefined;

export const setUiNavigator = (next: UiNavigator): void => {
  navigator = next;
};

const resolveNavigator = (): UiNavigator => {
  if (navigator === undefined) {
    throw new Error("UI navigator is not configured");
  }
  return navigator;
};

export const showUiWindow = (): void => {
  resolveNavigator().showWindow();
};

export const navigateUi = (target: NavigateTarget): void => {
  resolveNavigator().navigate(target);
};
