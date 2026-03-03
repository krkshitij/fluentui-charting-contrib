import { startServer } from "@microsoft/agents-hosting-express";
import express from "express";
import { resolve } from "path";
import { weatherAgent } from "./agent";
import { getChart } from "./chartStore";

const app = startServer(weatherAgent);

// Serve the chart page and other static assets
app.use(express.static(resolve(__dirname, "..", "public")));

// API endpoint for fetching stored chart data
app.get("/api/chart/:id", (req, res) => {
  const chart = getChart(req.params.id);
  if (!chart) {
    res.status(404).json({ error: "Chart not found or expired" });
    return;
  }
  res.json(chart);
});
