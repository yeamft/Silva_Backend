const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { assertEdit, requireProgramId } = require("../utils/modularRateAccess");
const ExcelJS = require("exceljs");

const MAX_ROWS = 2000;

const CATALOG_CONFIG = {
  labor: {
    key: "labor",
    model: "labor_activities",
    idPrefix: "lab",
    sheetName: "Labor",
    hasStock: false,
    requiredHeaders: ["name", "default_unit"],
    exportHeaders: ["name", "description", "default_unit", "is_active"],
  },
  equipment: {
    key: "equipment",
    model: "equipment_resources",
    idPrefix: "eqp",
    sheetName: "Equipment",
    hasStock: false,
    requiredHeaders: ["name", "default_unit"],
    exportHeaders: ["name", "description", "default_unit", "is_active"],
  },
  materials: {
    key: "materials",
    model: "materials",
    idPrefix: "mat",
    sheetName: "Materials",
    hasStock: true,
    requiredHeaders: ["name", "default_unit"],
    exportHeaders: ["name", "description", "default_unit", "stock_quantity", "is_active"],
  },
};

function getConfig(catalogType) {
  const cfg = CATALOG_CONFIG[catalogType];
  if (!cfg) throw new AppError(400, "VALIDATION_ERROR", "Unknown catalog type");
  return cfg;
}

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function headerAlias(h) {
  const n = normalizeHeader(h);
  if (n === "defaultunit" || n === "unit" || n === "default_unit") return "default_unit";
  if (n === "stockquantity" || n === "stock" || n === "stock_quantity") return "stock_quantity";
  if (n === "isactive" || n === "active" || n === "is_active") return "is_active";
  if (n === "name" || n === "description") return n;
  return n;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const src = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((c) => String(c).trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((c) => String(c).trim() !== "")) rows.push(row);
  }
  return rows;
}

async function parseWorkbookBuffer(buffer, filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".csv")) {
    return parseCsv(buffer.toString("utf8"));
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new AppError(400, "INVALID_FILE", "Workbook has no sheets");
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const raw = Array.isArray(row.values) ? row.values.slice(1) : [];
      const values = raw.map((v) => {
        if (v == null) return "";
        if (typeof v === "object" && v.text != null) return String(v.text);
        if (typeof v === "object" && v.result != null) return String(v.result);
        return String(v);
      });
      while (values.length && String(values[values.length - 1] || "").trim() === "") values.pop();
      if (values.some((v) => String(v || "").trim() !== "")) rows.push(values);
    });
    return rows;
  }
  throw new AppError(400, "INVALID_FILE", "Only .xlsx and .csv files are accepted");
}

function mapRows(rawRows, cfg) {
  if (!rawRows.length) {
    throw new AppError(400, "INVALID_FILE", "File is empty");
  }
  const headerCells = rawRows[0].map(headerAlias);
  const nameIdx = headerCells.indexOf("name");
  const unitIdx = headerCells.indexOf("default_unit");
  const descIdx = headerCells.indexOf("description");
  const stockIdx = headerCells.indexOf("stock_quantity");

  if (nameIdx < 0 || unitIdx < 0) {
    throw new AppError(
      400,
      "INVALID_FILE",
      "Missing required columns: name, default_unit",
    );
  }

  const dataRows = rawRows.slice(1);
  if (dataRows.length > MAX_ROWS) {
    throw new AppError(
      400,
      "INVALID_FILE",
      `File exceeds the maximum of ${MAX_ROWS} data rows`,
    );
  }

  return dataRows.map((cells, i) => {
    const rowNumber = i + 2; // 1-based spreadsheet row (header = 1)
    const name = String(cells[nameIdx] ?? "").trim();
    const defaultUnit = String(cells[unitIdx] ?? "").trim();
    const descriptionRaw = descIdx >= 0 ? String(cells[descIdx] ?? "").trim() : "";
    const stockRaw = stockIdx >= 0 ? String(cells[stockIdx] ?? "").trim() : "";
    return {
      rowNumber,
      name,
      defaultUnit,
      description: descriptionRaw || null,
      stockRaw: cfg.hasStock ? stockRaw : undefined,
    };
  });
}

function validateMappedRows(mapped, existingByName, cfg) {
  const seenInFile = new Map();
  const validRows = [];
  const errorRows = [];

  for (const row of mapped) {
    const errors = [];
    if (!row.name) errors.push("name is required");
    if (!row.defaultUnit) errors.push("default_unit is required");

    let stockQuantity;
    if (cfg.hasStock) {
      if (row.stockRaw === undefined || row.stockRaw === "") {
        stockQuantity = 0;
      } else {
        const n = Number(row.stockRaw);
        if (!Number.isFinite(n) || n < 0) {
          errors.push("stock_quantity must be a non-negative number");
        } else {
          stockQuantity = n;
        }
      }
    }

    const key = row.name.toLowerCase();
    if (row.name && seenInFile.has(key)) {
      errors.push(`duplicate name in file (also on row ${seenInFile.get(key)})`);
    } else if (row.name) {
      seenInFile.set(key, row.rowNumber);
    }

    if (errors.length) {
      errorRows.push({
        rowNumber: row.rowNumber,
        name: row.name || null,
        description: row.description,
        defaultUnit: row.defaultUnit || null,
        ...(cfg.hasStock ? { stockQuantity: stockQuantity ?? null } : {}),
        status: "error",
        reason: errors.join("; "),
      });
      continue;
    }

    const existing = existingByName.get(key);
    validRows.push({
      rowNumber: row.rowNumber,
      name: row.name,
      description: row.description,
      defaultUnit: row.defaultUnit,
      ...(cfg.hasStock ? { stockQuantity } : {}),
      status: existing ? "update" : "new",
      existingId: existing?.id || null,
    });
  }

  return { validRows, errorRows };
}

async function loadExistingByName(cfg, programId) {
  const rows = await prisma[cfg.model].findMany({
    where: { programId },
    select: { id: true, name: true },
  });
  const map = new Map();
  for (const r of rows) map.set(r.name.toLowerCase(), r);
  return map;
}

exports.preview = async (user, catalogType, file) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const cfg = getConfig(catalogType);
  if (!file?.buffer?.length) {
    throw new AppError(400, "INVALID_FILE", "No file uploaded");
  }

  const rawRows = await parseWorkbookBuffer(file.buffer, file.originalname);
  const mapped = mapRows(rawRows, cfg);
  const existingByName = await loadExistingByName(cfg, programId);
  const { validRows, errorRows } = validateMappedRows(mapped, existingByName, cfg);

  return {
    catalogType,
    validRows,
    errorRows,
    summary: {
      total: mapped.length,
      valid: validRows.length,
      errors: errorRows.length,
      toCreate: validRows.filter((r) => r.status === "new").length,
      toUpdate: validRows.filter((r) => r.status === "update").length,
    },
  };
};

exports.commit = async (user, catalogType, rows) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const cfg = getConfig(catalogType);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "No rows to import");
  }
  if (rows.length > MAX_ROWS) {
    throw new AppError(400, "VALIDATION_ERROR", `Cannot import more than ${MAX_ROWS} rows`);
  }

  // Re-validate against live DB inside transaction
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx[cfg.model].findMany({
        where: { programId },
        select: { id: true, name: true },
      });
      const byName = new Map(existing.map((r) => [r.name.toLowerCase(), r]));
      let created = 0;
      let updated = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = String(row.name || "").trim();
        const defaultUnit = String(row.defaultUnit || "").trim();
        if (!name || !defaultUnit) {
          throw new AppError(
            400,
            "VALIDATION_ERROR",
            `Row ${row.rowNumber || i + 1}: name and default_unit are required`,
          );
        }
        const description =
          row.description === undefined || row.description === null || row.description === ""
            ? null
            : String(row.description).trim();

        let stockQuantity;
        if (cfg.hasStock) {
          const n = row.stockQuantity == null || row.stockQuantity === "" ? 0 : Number(row.stockQuantity);
          if (!Number.isFinite(n) || n < 0) {
            throw new AppError(
              400,
              "VALIDATION_ERROR",
              `Row ${row.rowNumber || i + 1}: invalid stock_quantity`,
            );
          }
          stockQuantity = n;
        }

        const key = name.toLowerCase();
        const match = byName.get(key);
        if (match) {
          await tx[cfg.model].update({
            where: { id: match.id },
            data: {
              name,
              description,
              defaultUnit,
              ...(cfg.hasStock ? { stockQuantity } : {}),
              isActive: true,
            },
          });
          updated += 1;
        } else {
          const createdRow = await tx[cfg.model].create({
            data: {
              id: uuid(cfg.idPrefix),
              programId,
              name,
              description,
              defaultUnit,
              ...(cfg.hasStock ? { stockQuantity } : {}),
              isActive: true,
            },
          });
          byName.set(key, { id: createdRow.id, name });
          created += 1;
        }
      }

      return { created, updated, total: created + updated };
    });
    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, "IMPORT_FAILED", err.message || "Import rolled back due to a database error");
  }
};

exports.buildExport = async (user, catalogType, query = {}) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const cfg = getConfig(catalogType);

  const where = { programId };
  if (query.isActive === "true" || query.isActive === true) where.isActive = true;
  if (query.isActive === "false" || query.isActive === false) where.isActive = false;
  // includeInactive ignored when isActive set; default export all matching search

  const q = String(query.q || query.search || "").trim().toLowerCase();
  let rows = await prisma[cfg.model].findMany({
    where,
    orderBy: { name: "asc" },
  });

  if (q) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        r.defaultUnit.toLowerCase().includes(q),
    );
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(cfg.sheetName);
  sheet.addRow(cfg.exportHeaders);

  for (const r of rows) {
    const line = [r.name, r.description || "", r.defaultUnit];
    if (cfg.hasStock) line.push(Number(r.stockQuantity));
    line.push(r.isActive ? "true" : "false");
    sheet.addRow(line);
  }

  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((col) => {
    let max = 12;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = Math.min(len, 48);
    });
    col.width = max + 2;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${cfg.key}-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return { buffer: Buffer.from(buffer), filename, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
};

exports.CATALOG_CONFIG = CATALOG_CONFIG;
exports.MAX_ROWS = MAX_ROWS;
