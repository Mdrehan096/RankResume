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

const defaultOrigins = "http://localhost:5173,http://127.0.0.1:5173"
const allowedOrigins = (process.env.CLIENT_URL || defaultOrigins)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)

app.use(cors({
    origin(origin, callback) {
        // Allow requests without Origin (e.g. same-origin, server-to-server, curl) or configured origins
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true)
        }
        return callback(null, false)
    },
    credentials: true
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
