import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./design/tokens.css";
import "./design/base.css";
import "./design/components.css";
// Feature stylesheets: each migrated screen owns its CSS instead of adding another
// override layer to components.css.
import "./features/worklist/worklist.css";
import "./design/utilities.css";
import "./a11yDev";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
