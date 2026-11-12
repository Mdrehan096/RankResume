const multer = require("multer")
const path = require("path")
const AppError = require("../utils/appError")

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx"])
const ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
])

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB (matches frontend dropzone advertisement)
        files: 1,
    },
    fileFilter(req, file, cb) {
        const ext = path.extname(file.originalname || "").toLowerCase()
        const mime = (file.mimetype || "").toLowerCase()

        if (!ALLOWED_EXTENSIONS.has(ext) || (mime && !ALLOWED_MIME_TYPES.has(mime))) {
            return cb(new AppError(400, "Only PDF and DOCX files are allowed."))
        }
        cb(null, true)
    },
})

module.exports = upload
