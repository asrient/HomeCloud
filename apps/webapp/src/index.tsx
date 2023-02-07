import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { subtract } from "@pine/lib/utils";

const App = () => {
  const [data, setData] = useState<number>(10);

  return (
    <StrictMode>
      <h1>Welcome to Pine.</h1>
      <h2>Data from Lib</h2>
      <pre>Subtract: {subtract(10, 6)}</pre>
    </StrictMode>
  );
};

const app = document.querySelector("#app");
if (app) createRoot(app).render(<App />);
