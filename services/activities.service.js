const AppError = require("../utils/AppError");
const prisma = require("../config/database");

function serialize(row) {
  return {
    id: row.id,
    tier: row.tier,
    category: row.category,
    name: row.name,
    unitOfMeasure: row.unitOfMeasure,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Read-only platform activity taxonomy.
 * @param {{ tier?: string|number, category?: string, q?: string }} query
 */
exports.list = async (query = {}) => {
  const where = {};
  if (query.tier != null && query.tier !== "") {
    const tier = Number(query.tier);
    if (![1, 2, 3].includes(tier)) {
      throw new AppError(400, "VALIDATION_ERROR", "tier must be 1, 2, or 3");
    }
    where.tier = tier;
  }
  if (query.category) {
    where.category = String(query.category).trim();
  }
  if (query.q) {
    const q = String(query.q).trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { id: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.activities.findMany({
    where,
    orderBy: [{ tier: "asc" }, { category: "asc" }, { id: "asc" }],
  });
  return rows.map(serialize);
};

exports.get = async (id) => {
  const row = await prisma.activities.findUnique({ where: { id: String(id) } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Activity not found");
  return serialize(row);
};
