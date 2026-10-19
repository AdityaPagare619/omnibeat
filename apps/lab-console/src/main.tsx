import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./app.css";

const el = document.getElementById("root");
if (!el) throw new Error("lab-console: #root missing from index.html");

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
