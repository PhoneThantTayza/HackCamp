import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "../res/css/index.css";

createRoot(document.getElementById("root")).render(React.createElement(React.StrictMode, null, React.createElement(App)));
