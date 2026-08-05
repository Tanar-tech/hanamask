import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/theme.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("index.html に #root が見つかりません");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
