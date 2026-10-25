const { z } = require("zod");

const revision = z.coerce.number().int().min(0);
exports.save = z.object({ findings: z.string().trim().max(20000), revision });
exports.submit = z.object({ revision });
exports.decide = z.object({
  revision,
  decision: z.enum(["approve", "request_changes"]),
  comment: z.string().trim().max(5000).default(""),
}).refine((body) => body.decision !== "request_changes" || body.comment.length > 0, {
  message: "Explain the changes needed before returning the assessment.",
  path: ["comment"],
});
