const express = require("express")
const cookieParser = require("cookie-parser")
const cors = require("cors")
const multer = require("multer")
const { securityHeaders } = require("./middlewares/security.middleware")

const app = express()

app.disable("x-powered-by")
app.use(securityHeaders)
app.use(express.json({ limit: "100kb" }))
app.use(cookieParser())

const defaultOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "https://rank-resume-alpha.vercel.app",
]

const envOrigins = (process.env.CLIENT_URL || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean)

const allowedOriginSet = new Set([...defaultOrigins, ...envOrigins])

function isAllowedOrigin(origin) {
    if (!origin) return true
    const normalized = origin.trim().replace(/\/+$/, "")
    if (allowedOriginSet.has(normalized)) return true
    try {
        const url = new URL(normalized)
        if (
            url.hostname.endsWith(".vercel.app") ||
            url.hostname === "localhost" ||
            url.hostname === "127.0.0.1"
        ) {
            return true
        }
    } catch {
        // invalid origin url
    }
    return false
}

app.use(cors({
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
            return callback(null, true)
        }
        return callback(null, false)
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
}))

/* require all the routes here */
const authRouter = require("./routes/auth.routes")
const interviewRouter = require("./routes/interview.routes")

/* using all the routes here */
app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok" })
})

app.use("/api/auth", authRouter)
app.use("/api/interview", interviewRouter)

/* 404 handler for unknown routes */
app.use((req, res) => {
    res.status(404).json({
        message: "Route not found."
    })
})

/* global error handler - never leak stack traces */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const message =
            err.code === "LIMIT_FILE_SIZE"
                ? "Resume file size must be 5MB or less."
                : err.message || "File upload error."
        return res.status(400).json({ message })
    }

    if (err?.type === "entity.parse.failed") {
        return res.status(400).json({
            message: "Invalid JSON payload."
        })
    }

    if (err?.name === "ValidationError") {
        return res.status(400).json({
            message: err.message || "Validation failed."
        })
    }

    if (err?.name === "CastError") {
        return res.status(400).json({
            message: "Invalid ID format."
        })
    }

    if (err?.isOperational && err.statusCode) {
        return res.status(err.statusCode).json({
            message: err.message
        })
    }

    console.error("Unhandled backend error:", err)
    return res.status(500).json({
        message: "An internal server error occurred. Please try again."
    })
})

module.exports = app
module.exports.isAllowedOrigin = isAllowedOrigin
