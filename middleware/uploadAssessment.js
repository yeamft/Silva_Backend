const multer = require("multer");
const AppError = require("../utils/AppError");

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2, fieldSize: 100000 },
  fileFilter(_req, file, cb) {
    if (!/\.pdf$/i.test(file.originalname)) {
      return cb(new AppError(400, "INVALID_FILE", "Upload the assessment report as a PDF (up to 5 MB)."));
    }
    cb(null, true);
  },
});
