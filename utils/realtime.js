const { EventEmitter } = require("node:events");

/**
 * In-process change bus for server push. Every write to a watched table is announced here
 * (see config/database.js) and streamed to open browsers by routes/events.routes.js.
 * One backend instance is assumed; with several, swap this for Redis or Postgres LISTEN/NOTIFY.
 */
const bus = new EventEmitter();
bus.setMaxListeners(0);

/** Tables whose changes the screens care about, and the name the browser uses for each. */
const WATCHED = {
  work_orders: "work_orders",
  field_tickets: "work_orders",
  cropfort_monthly_work_orders: "monthly_work_orders",
  cropfort_monthly_wo_lines: "monthly_work_orders",
  cropfort_programme_plans: "programme_plans",
  cropfort_programme_plan_lines: "programme_plans",
  rate_card_proposals: "rate_cards",
  benchmark_surveys: "rate_cards",
  notifications: "notifications",
  cropfort_reports: "reports",
  cropfort_afes: "afes",
  cropfort_farm_assessments: "farm_assessments",
  payment_requests: "payments",
  owner_settlements: "payments",
};

function programIdOf(args, result) {
  if (result && typeof result === "object" && !Array.isArray(result) && result.programId) return result.programId;
  const data = args?.data;
  if (Array.isArray(data)) return data[0]?.programId || null;
  return data?.programId || args?.where?.programId || null;
}

/** Called after a write; never throws, never blocks the request. */
function announce(model, args, result) {
  const topic = WATCHED[model];
  if (!topic) return;
  try {
    bus.emit("change", { topic, programId: programIdOf(args, result), at: Date.now() });
  } catch {
    /* a broken listener must not affect the write */
  }
}

function subscribe(listener) {
  bus.on("change", listener);
  return () => bus.off("change", listener);
}

module.exports = { announce, subscribe };
