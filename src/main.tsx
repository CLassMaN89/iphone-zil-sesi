import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function ProjectShell() {
  return <main><h1>iPhone zil sesi hazırla</h1></main>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ProjectShell />
  </StrictMode>,
);
