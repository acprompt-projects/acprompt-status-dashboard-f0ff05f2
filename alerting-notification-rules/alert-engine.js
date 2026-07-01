const EventEmitter = require("events");

class AlertEngine extends EventEmitter {
  constructor(store = new Map()) {
    super();
    this.rules = new Map();
    this.history = store;
    this.notifiers = new Map();
  }

  addRule(rule) {
    if (!rule.id || !rule.metric || !rule.condition || !rule.threshold) {
      throw new Error("Rule must have id, metric, condition, threshold");
    }
    const prepared = {
      ...rule,
      windowMinutes: rule.windowMinutes || 5,
      cooldownMinutes: rule.cooldownMinutes || 15,
      channels: rule.channels || ["webhook"],
      enabled: rule.enabled !== false,
      lastFired: null,
      metricBuffer: [],
    };
    this.rules.set(rule.id, prepared);
    return prepared;
  }

  removeRule(id) {
    return this.rules.delete(id);
  }

  getRules() {
    return Array.from(this.rules.values());
  }

  registerNotifier(name, handler) {
    this.notifiers.set(name, handler);
  }

  async ingest(metric, value, timestamp = Date.now()) {
    for (const [id, rule] of this.rules) {
      if (!rule.enabled || rule.metric !== metric) continue;
      rule.metricBuffer.push({ value, timestamp });
      const cutoff = timestamp - rule.windowMinutes * 60 * 1000;
      rule.metricBuffer = rule.metricBuffer.filter((e) => e.timestamp >= cutoff);
      await this._evaluate(rule, timestamp);
    }
  }

  async _evaluate(rule, now) {
    const triggered = rule.metricBuffer.every((entry) => {
      switch (rule.condition) {
        case "gt": return entry.value > rule.threshold;
        case "gte": return entry.value >= rule.threshold;
        case "lt": return entry.value < rule.threshold;
        case "lte": return entry.value <= rule.threshold;
        case "eq": return entry.value === rule.threshold;
        default: return false;
      }
    });

    if (!triggered) return;

    if (rule.lastFired && now - rule.lastFired < rule.cooldownMinutes * 60 * 1000) return;

    rule.lastFired = now;
    const incident = {
      id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ruleId: rule.id,
      metric: rule.metric,
      condition: rule.condition,
      threshold: rule.threshold,
      currentValue: rule.metricBuffer[rule.metricBuffer.length - 1]?.value,
      firedAt: now,
      channels: rule.channels,
      status: "firing",
    };

    this.history.set(incident.id, incident);
    this.emit("alert", incident);

    const dispatches = rule.channels.map((ch) => this._dispatch(ch, incident, rule).catch(() => null));
    await Promise.allSettled(dispatches);
  }

  async _dispatch(channel, incident, rule) {
    const notifier = this.notifiers.get(channel);
    if (notifier) return notifier(incident, rule);

    if (channel === "webhook" && rule.webhookUrl) {
      return this._sendWebhook(rule.webhookUrl, incident);
    }
    if (channel === "slack" && rule.slackWebhook) {
      return this._sendSlack(rule.slackWebhook, incident);
    }
  }

  async _sendWebhook(url, incident) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(incident),
    });
    if (!res.ok) throw new Error(`Webhook failed: ${res.status}`);
  }

  async _sendSlack(webhookUrl, incident) {
    const payload = {
      text: `⚠️ *Alert:* ${incident.metric} ${incident.condition} ${incident.threshold} (current: ${incident.currentValue})`,
      attachments: [{ color: "danger", fields: [
        { title: "Rule", value: incident.ruleId, short: true },
        { title: "Status", value: incident.status, short: true },
        { title: "Fired At", value: new Date(incident.firedAt).toISOString(), short: false },
      ]}],
    };
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Slack failed: ${res.status}`);
  }

  resolveIncident(incidentId, resolvedAt = Date.now()) {
    const incident = this.history.get(incidentId);
    if (!incident) return null;
    incident.status = "resolved";
    incident.resolvedAt = resolvedAt;
    incident.duration = resolvedAt - incident.firedAt;
    this.emit("resolved", incident);
    return incident;
  }

  getHistory(opts = {}) {
    let entries = Array.from(this.history.values());
    if (opts.ruleId) entries = entries.filter((e) => e.ruleId === opts.ruleId);
    if (opts.status) entries = entries.filter((e) => e.status === opts.status);
    entries.sort((a, b) => b.firedAt - a.firedAt);
    if (opts.limit) entries = entries.slice(0, opts.limit);
    return entries;
  }
}

module.exports = { AlertEngine };