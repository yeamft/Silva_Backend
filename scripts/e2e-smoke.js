/**
 * Live API smoke: AFE → WO → ticket → PR → settlement + read surfaces.
 * Usage: node scripts/e2e-smoke.js
 */
const BASE = process.env.API_BASE || "http://localhost:5000/api/v1";
const PASS = process.env.DEMO_PASSWORD || "Password123!";

const results = [];

function log(step, ok, detail) {
  const d = String(detail || "").slice(0, 220);
  results.push({ step, ok, detail: d });
  console.log(`${ok ? "OK  " : "FAIL"} | ${step}${d ? ` — ${d}` : ""}`);
}

async function req(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error((data && data.error && data.error.message) || text || String(res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data.data !== undefined ? data.data : data;
}

async function login(email) {
  const data = await req("POST", "/auth/login", null, { email, password: PASS });
  if (data.requiresOtp) throw new Error(`OTP required for ${email}`);
  const token = data.accessToken || data.token || data.access_token;
  if (!token) throw new Error(`No token for ${email}: ${JSON.stringify(data).slice(0, 160)}`);
  return token;
}

async function main() {
  try {
    const h = await fetch(`${BASE}/health`);
    const j = await h.json();
    log("health", !!(j.data && (j.data.ok || j.data.db !== false)) || h.ok, JSON.stringify(j));
  } catch (e) {
    log("health", false, e.message);
    process.exit(1);
  }

  let spx;
  let silva;
  let bagro;
  let finance;
  try {
    spx = await login("admin@spx.example");
    log("login SPX admin", true);
  } catch (e) {
    log("login SPX admin", false, e.message);
  }
  try {
    silva = await login("owner@silva.example");
    log("login Silva owner", true);
  } catch (e) {
    log("login Silva owner", false, e.message);
  }
  try {
    bagro = await login("manager@bagro.example");
    log("login Bagro manager", true);
  } catch (e) {
    log("login Bagro manager", false, e.message);
  }
  try {
    finance = await login("finance@silva.example");
    log("login Silva finance", true);
  } catch (e) {
    log("login Silva finance", false, e.message);
  }
  if (!spx) {
    process.exit(1);
  }

  let me;
  try {
    me = await req("GET", "/auth/me", spx);
    log(
      "auth/me",
      true,
      `${me.email || ""} program=${me.activeProgramId || me.activeProgram?.id || "none"} role=${me.role}`,
    );
  } catch (e) {
    log("auth/me", false, e.message);
  }

  let programId = me?.activeProgramId || me?.activeProgram?.id;
  if (!programId) {
    try {
      const programs = await req("GET", "/programs", spx);
      const list = Array.isArray(programs) ? programs : programs.items || [];
      log("list programs", list.length > 0, `count=${list.length}`);
      if (list[0]) {
        await req("POST", "/auth/switch-program", spx, { programId: list[0].id });
        programId = list[0].id;
        log("switch-program", true, programId);
        me = await req("GET", "/auth/me", spx);
      }
    } catch (e) {
      log("programs/switch", false, e.message);
    }
  }

  for (const [label, path, token] of [
    ["programme-plans", "/programme-plans", spx],
    ["afes", "/afes", spx],
    ["work-orders", "/work-orders", spx],
    ["field-tickets", "/work-orders/tickets", spx],
    ["payment-requests", "/payment-requests", spx],
    ["settlements", "/payment-requests/settlements", finance || silva || spx],
    ["notifications", "/notifications", spx],
    ["users/directory", "/users/directory", spx],
    ["agreement-config", "/agreement-config", spx],
  ]) {
    try {
      const d = await req("GET", path, token);
      const n = Array.isArray(d) ? d.length : d ? 1 : 0;
      log(`GET ${label}`, true, `n=${n}`);
    } catch (e) {
      log(`GET ${label}`, false, `${e.status || ""} ${e.message}`);
    }
  }

  if (bagro) {
    try {
      const d = await req("GET", "/work-orders", bagro);
      log("GET work-orders (bagro)", true, `n=${Array.isArray(d) ? d.length : 0}`);
    } catch (e) {
      log("GET work-orders (bagro)", false, e.message);
    }
    try {
      const d = await req("GET", "/notifications", bagro);
      log("GET notifications (bagro)", true, `n=${Array.isArray(d) ? d.length : 0}`);
    } catch (e) {
      log("GET notifications (bagro)", false, e.message);
    }
  }

  let afeId;
  let woId;
  let ticketId;
  let prId;

  try {
    const afe = await req("POST", "/afes", spx, {
      title: `E2E AFE ${Date.now()}`,
      amountEtb: 12500,
      sourceType: "manual",
    });
    afeId = afe.id;
    log("create AFE", true, `${afe.id} ${afe.status}`);
  } catch (e) {
    log("create AFE", false, e.message);
  }

  if (afeId) {
    try {
      const a = await req("POST", `/afes/${afeId}/submit`, spx);
      log("submit AFE", a.status === "submitted", a.status);
    } catch (e) {
      log("submit AFE", false, e.message);
    }
    const decider = silva || spx;
    try {
      const a = await req("POST", `/afes/${afeId}/decide`, decider, { decision: "approve" });
      log("approve AFE", a.status === "approved", `${a.status} via ${silva ? "silva" : "spx"}`);
    } catch (e) {
      log("approve AFE", false, e.message);
    }
  }

  let vendorUserId = null;
  try {
    const dir = await req("GET", "/users/directory", spx);
    const list = Array.isArray(dir) ? dir : dir.users || [];
    const v = list.find((u) =>
      /bagro|vendor/i.test(`${u.email || ""}${u.organizationName || ""}${u.role || ""}`),
    );
    if (v) {
      vendorUserId = v.id;
      log("directory vendor user", true, `${v.email} ${v.id}`);
    } else {
      log("directory vendor user", false, `none found count=${list.length}`);
    }
  } catch (e) {
    log("directory vendor user", false, e.message);
  }

  try {
    const wo = await req("POST", "/work-orders", spx, {
      title: `E2E WO ${Date.now()}`,
      activity: "Weeding",
      category: "Field",
      weekStart: 12,
      plannedCostEtb: 5000,
      ...(afeId ? { cropfortAfeId: afeId } : {}),
    });
    woId = wo.id;
    log("create WO", true, `${wo.id} ${wo.status}${wo.cropfortAfeId ? " linkedAFE" : ""}`);
  } catch (e) {
    log("create WO", false, e.message);
  }

  if (woId) {
    try {
      const issued = await req("POST", `/work-orders/${woId}/transition`, spx, { status: "issued" });
      log("issue WO", issued.status === "issued", issued.status);
    } catch (e) {
      log("issue WO", false, e.message);
    }

    try {
      const t = await req("POST", `/work-orders/${woId}/tickets`, bagro || spx, {
        activityRecorded: "Weeding",
        areaHa: 1.5,
        laborCount: 4,
        materialsUsed: "none",
        actualQuantity: 1.5,
        unitRateEtb: 1000,
        ...(vendorUserId ? { vendorUserId } : {}),
      });
      ticketId = t.id;
      log("create ticket", true, `${t.id} ${t.status} by ${bagro ? "bagro" : "spx"}`);
    } catch (e) {
      log("create ticket", false, e.message);
    }
  }

  if (ticketId) {
    try {
      const t = await req("POST", `/work-orders/tickets/${ticketId}/transition`, bagro || spx, {
        status: "submitted",
      });
      log("submit ticket", t.status === "submitted", t.status);
    } catch (e) {
      log("submit ticket", false, e.message);
    }
    try {
      const t = await req("POST", `/work-orders/tickets/${ticketId}/transition`, bagro || spx, {
        status: "vendor_reviewed",
      });
      log("vendor_review ticket", t.status === "vendor_reviewed", t.status);
    } catch (e) {
      log("vendor_review ticket", false, e.message);
    }
    try {
      const t = await req("POST", `/work-orders/tickets/${ticketId}/transition`, spx, {
        status: "validated",
      });
      log("validate ticket", t.status === "validated", t.status);
    } catch (e) {
      log("validate ticket", false, e.message);
    }
  }

  if (ticketId) {
    try {
      const pr = await req("POST", "/payment-requests", bagro || spx, { fieldTicketId: ticketId });
      prId = pr.id;
      log("create PR", true, `${pr.id} ${pr.status} amt=${pr.amountRequestedEtb}`);
    } catch (e) {
      log("create PR", false, e.message);
    }
  }

  if (prId) {
    // Maker-checker: verifier must differ from creator. If bagro created, SPX can verify.
    const verifier = bagro ? spx : silva || finance || spx;
    try {
      const pr = await req("POST", `/payment-requests/${prId}/verify`, verifier);
      log("verify PR", pr.status === "verified", pr.status);
    } catch (e) {
      log("verify PR", false, e.message);
    }
    // Product: SPX authorizes settlement; Silva finance marks settled.
    try {
      const s = await req("POST", `/payment-requests/${prId}/authorize-settlement`, spx, {
        narrative: "E2E settle",
      });
      log(
        "authorize settlement",
        s.status === "authorized" || !!s.id,
        `${s.status || ""} ${s.code || s.id || ""}`.trim(),
      );
    } catch (e) {
      log("authorize settlement", false, e.message);
    }
  }

  try {
    const list = await req("GET", "/payment-requests/settlements", finance || silva || spx);
    const open = (Array.isArray(list) ? list : []).find((s) => s.status === "authorized");
    if (open) {
      const settler = finance || silva || spx;
      const s = await req("POST", `/payment-requests/settlements/${open.id}/settle`, settler);
      log("mark settled", s.status === "settled", `${s.status} via ${finance ? "finance" : silva ? "silva" : "spx"}`);
    } else {
      log("mark settled", false, "no authorized settlement found");
    }
  } catch (e) {
    log("mark settled", false, e.message);
  }

  try {
    const n = await req("GET", "/notifications", spx);
    log("notifications after flow (spx)", true, `n=${Array.isArray(n) ? n.length : 0}`);
  } catch (e) {
    log("notifications after flow (spx)", false, e.message);
  }
  if (bagro) {
    try {
      const n = await req("GET", "/notifications", bagro);
      log("notifications after flow (bagro)", true, `n=${Array.isArray(n) ? n.length : 0}`);
    } catch (e) {
      log("notifications after flow (bagro)", false, e.message);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n==== SUMMARY ====");
  console.log(`passed=${results.length - failed.length} failed=${failed.length}`);
  if (failed.length) {
    console.log(failed.map((f) => `${f.step}: ${f.detail}`).join("\n"));
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
