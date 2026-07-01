const { Router } = require("express");
const { AlertEngine } = require("./alert-engine");

function createAlertRoutes(engine = new AlertEngine()) {
  const router = Router();

  router.get("/rules", (_req, res) => {
    res.json(engine.getRules());
  });

  router.post("/rules", (req, res) => {
    try {
      const rule = engine.addRule(req.body);
      res.status(201).json(rule);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete("/rules/:id", (req, res) => {
    const removed = engine.removeRule(req.params.id);
    res.json({ deleted: removed });
  });

  router.post("/ingest", async (req, res) => {
    const { metric, value, timestamp } = req.body;
    if (!metric || value === undefined) {
      return res.status(400).json({ error: "metric and value required" });
    }
    await engine.ingest(metric, value, timestamp || Date.now());
    res.json({ ok: true });
  });

  router.get("/history", (req, res) => {
    const { ruleId, status, limit } = req.query;
    res.json(engine.getHistory({
      ruleId: ruleId || undefined,
      status: status || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    }));
  });

  router.post("/history/:id/resolve", (req, res) => {
    const incident = engine.resolveIncident(req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    res.json(incident);
  });

  router.post("/notifiers", (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    engine.registerNotifier(name, async (incident, rule) => {
      engine.emit("custom:notifier", { notifier: name, incident, rule });
    });
    res.status(201).json({ registered: name });
  });

  return { router, engine };
}

module.exports = { createAlertRoutes };