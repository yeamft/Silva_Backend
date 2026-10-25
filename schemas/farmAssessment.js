const { z } = require("zod");

const revision = z.coerce.number().int().min(0);

exports.create = z.object({
  farmEstateId: z.string().min(1),
  planId: z.string().optional(),
  planYear: z.coerce.number().int().min(2000).max(2100).optional(),
  planningCycle: z.string().trim().max(200).optional(),
  title: z.string().trim().max(300).optional(),
  assessmentDate: z.string().optional(),
  assessorName: z.string().trim().max(200).optional(),
  assessorUserId: z.string().optional(),
  assessmentPurpose: z.enum(["annual_baseline", "follow_up", "special"]).optional(),
  blockIds: z.array(z.string()).optional(),
});

exports.save = z.object({
  revision,
  findings: z.string().trim().max(20000).optional(),
  assessedAreaHa: z.coerce.number().nonnegative().optional().nullable(),
  cropStage: z.string().trim().max(200).optional().nullable(),
  generalCondition: z.enum(["good", "fair", "poor"]).optional().nullable(),
  recommendedOps: z.array(z.any()).optional(),
  assessorName: z.string().trim().max(200).optional(),
  assessorUserId: z.string().optional().nullable(),
  assessmentDate: z.string().optional(),
  planningCycle: z.string().trim().max(200).optional(),
  planYear: z.coerce.number().int().min(2000).max(2100).optional().nullable(),
  title: z.string().trim().max(300).optional(),
  blockIds: z.array(z.string()).optional(),
  planId: z.string().optional().nullable(),
});

exports.submit = z.object({ revision });

exports.decide = z.object({
  revision,
  decision: z.enum(["approve", "request_changes"]),
  comment: z.string().trim().max(5000).default(""),
}).refine((body) => body.decision !== "request_changes" || body.comment.length > 0, {
  message: "Explain the changes needed before returning the assessment.",
  path: ["comment"],
});
