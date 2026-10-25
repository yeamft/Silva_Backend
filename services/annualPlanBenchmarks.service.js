const prisma = require("../config/database");

exports.getLatest = async (version) => {
  const set = version
    ? await prisma.cropfort_annual_benchmark_sets.findUnique({
        where: { version },
        include: { activities: { orderBy: { code: "asc" } } },
      })
    : await prisma.cropfort_annual_benchmark_sets.findFirst({
    orderBy: [{ importedAt: "desc" }, { version: "desc" }],
    include: { activities: { orderBy: { code: "asc" } } },
  });
  if (!set) return { version: null, sourceFile: null, importedAt: null, activities: [] };
  return {
    version: set.version,
    sourceFile: set.sourceFile,
    importedAt: set.importedAt.toISOString(),
    activities: set.activities.map((activity) => ({
      code: activity.code,
      category: activity.category,
      subgroup: activity.subgroup,
      activity: activity.activityName,
      unit: activity.unit,
      farms: activity.farms,
      dataNotes: activity.dataNotes,
      sourceRow: activity.sourceRow,
      taxonomyActivityId: activity.taxonomyActivityId,
    })),
  };
};