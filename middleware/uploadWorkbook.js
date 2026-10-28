const multer = require("multer");
const AppError = require("../utils/AppError");

/** Single .xlsx workbook upload, kept in memory (benchmark import). */
module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2, fieldSize: 100000 },
  fileFilter(_req, file, cb) {
    if (!/\.xlsx$/i.test(file.originalname)) {
      return cb(new AppError(400, "INVALID_FILE", "Upload the annual-plan workbook as an .xlsx file (up to 10 MB)."));
    }
    cb(null, true);
  },
});
