const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const { securityHeaders, createRateLimiter } = require("../../src/middlewares/security.middleware")

function createMockRes() {
    const headers = {}
    return {
        statusCode: 200,
        body: null,
        headers,
        setHeader(k, v) {
            headers[k] = v
        },
        status(code) {
            this.statusCode = code
            return this
        },
        json(payload) {
            this.body = payload
            return this
        },
    }
}

describe("security.middleware unit tests", () => {
    it("sets defensive HTTP security headers", () => {
        const res = createMockRes()
        let nextCalled = false
        securityHeaders({}, res, () => {
            nextCalled = true
        })

        assert.equal(nextCalled, true)
        assert.equal(res.headers["X-Content-Type-Options"], "nosniff")
        assert.equal(res.headers["X-Frame-Options"], "DENY")
        assert.equal(res.headers["Referrer-Policy"], "no-referrer")
        assert.equal(res.headers["Cross-Origin-Resource-Policy"], "cross-origin")
    })

    it("enforces request limits and sets Retry-After on 429", () => {
        const prev = process.env.DISABLE_RATE_LIMIT
        delete process.env.DISABLE_RATE_LIMIT

        try {
            const limiter = createRateLimiter({ windowMs: 10000, max: 2, message: "Slow down" })
            const req = { ip: "10.0.0.1" }

            let passed = 0
            limiter(req, createMockRes(), () => { passed++ })
            limiter(req, createMockRes(), () => { passed++ })
            assert.equal(passed, 2)

            const thirdRes = createMockRes()
            let thirdNext = false
            limiter(req, thirdRes, () => { thirdNext = true })
            assert.equal(thirdNext, false)
            assert.equal(thirdRes.statusCode, 429)
            assert.equal(thirdRes.body.message, "Slow down")
            assert.ok(Number(thirdRes.headers["Retry-After"]) >= 1)
        } finally {
            if (prev === undefined) {
                delete process.env.DISABLE_RATE_LIMIT
            } else {
                process.env.DISABLE_RATE_LIMIT = prev
            }
        }
    })
})

