const prisma = require("../config/database");

/**
 * When a user has exactly one program membership and no active program, select it automatically.
 */
async function ensureActiveProgram(user) {
  if (user.activeProgramId) return user.activeProgramId;
  const memberships = await prisma.program_memberships.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "asc" },
    select: { programId: true },
  });
  if (memberships.length !== 1) return null;
  const programId = memberships[0].programId;
  await prisma.users.update({
    where: { id: user.id },
    data: { activeProgramId: programId },
  });
  return programId;
}

async function hydrateUserContext(user) {
  const activeProgramId = await ensureActiveProgram(user);
  return {
    activeProgramId: activeProgramId ?? user.activeProgramId ?? null,
    changed: Boolean(activeProgramId && activeProgramId !== user.activeProgramId),
  };
}

module.exports = {
  ensureActiveProgram,
  hydrateUserContext,
};
