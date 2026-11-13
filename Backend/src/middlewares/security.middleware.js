function securityHeaders(req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("Referrer-Policy", "no-referrer")
    res.setHeader("X-XSS-Protection", "0")
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin")
    next()
}

function createRateLimiter({ windowMs, max, message, keyGenerator }) {
    const hits = new Map()

    // Periodically prune expired windows so memory cannot grow unboundedly
    const cleanupTimer = setInterval(() => {
        const now = Date.now()
        for (const [key, entry] of hits.entries()) {
            if (entry.resetAt <= now) {
                hits.delete(key)
            }
        }
    }, Math.max(windowMs, 60000))
    if (typeof cleanupTimer.unref === "function") {
        cleanupTimer.unref()
    }

    return function rateLimiter(req, res, next) {
        if (process.env.DISABLE_RATE_LIMIT === "true") {
            return next()
        }

        const key = keyGenerator ? keyGenerator(req) : (req.ip || req.socket?.remoteAddress || "unknown")
        const now = Date.now()
        const existing = hits.get(key)

        if (!existing || existing.resetAt <= now) {
            hits.set(key, { count: 1, resetAt: now + windowMs })
            return next()
        }

        existing.count += 1
        if (existing.count > max) {
            const retryAfter = Math.ceil((existing.resetAt - now) / 1000)
            res.setHeader("Retry-After", String(Math.max(1, retryAfter)))
            return res.status(429).json({
                message: message || "Too many requests. Please try again later.",
            })
        }

        next()
    }
}

module.exports = {
    securityHeaders,
    createRateLimiter,
}

