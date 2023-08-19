import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app";

const Root = () => {
  return (
    <App />
  );
};

const app = document.querySelector("#app");
if (app) createRoot(app).render(<Root />);
