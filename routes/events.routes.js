const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const realtime = require("../utils/realtime");

const router = express.Router();

/**
 * Server push: an open screen keeps this request open and gets a small "something changed"
 * event (topic only, no data) whenever its programme's records change, then refetches.
 */
router.get("/", authenticateJWT, (req, res) => {
  const programId = req.user?.activeProgramId || null;
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`event: ready\ndata: {}\n\n`);

  const unsubscribe = realtime.subscribe((change) => {
    // Changes without a programme (rare) go to everyone; others only to that programme
    if (change.programId && programId && change.programId !== programId) return;
    res.write(`event: change\ndata: ${JSON.stringify({ topic: change.topic })}\n\n`);
  });
  // Keeps proxies (Render, browsers) from closing an idle stream
  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

module.exports = router;
