import express from "express";
import ViteExpress from "vite-express";

const app = express();
const port = Number(process.env.PORT || 3000);

if (process.argv.includes("--production")) {
  ViteExpress.config({ mode: "production" });
}

app.use(express.json({ limit: "100kb" }));

// API routes go before Vite's page handler.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

ViteExpress.listen(app, port, () => {
  console.log(`A11yFix is running at http://localhost:${port}`);
});
