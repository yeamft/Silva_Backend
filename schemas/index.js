const { z } = require("zod");

const login = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const refresh = z.object({ refreshToken: z.string().min(1) });
const forgot = z.object({ email: z.string().email() });
const reset = z.object({ token: z.string().min(1), password: z.string().min(8) });
const changePassword = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
const verifyOtp = z.object({
  otpChallengeToken: z.string().min(1),
  code: z.string().min(6).max(8),
  deviceLabel: z.string().optional(),
});
const enrollTotp = z.object({
  enrollmentToken: z.string().min(1),
  code: z.string().min(6).max(8),
});
const signup = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  orgName: z.string().min(1),
  orgSlug: z.string().optional(),
  orgType: z.enum(["silva", "vendor"]),
  displayName: z.string().optional(),
  vendorCategory: z.string().optional(),
  branding: z.record(z.any()).optional(),
});
const switchProgram = z.object({ programId: z.string().min(1) });
const tenantBranding = z.object({
  displayName: z.string().min(1).optional(),
  branding: z.record(z.any()).optional(),
});

module.exports = {
  login,
  refresh,
  forgot,
  reset,
  changePassword,
  verifyOtp,
  enrollTotp,
  signup,
  switchProgram,
  tenantBranding,
};
