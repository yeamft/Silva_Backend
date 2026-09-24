const multer = require("multer");
const AppError = require("../utils/AppError");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || "").toLowerCase();
    if (name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls")) {
      cb(null, true);
      return;
    }
    cb(new AppError(400, "INVALID_FILE", "Only .xlsx and .csv files are accepted"));
  },
});

module.exports = upload;
