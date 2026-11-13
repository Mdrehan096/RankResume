const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const { isAllowedOrigin } = require("../../src/app")

describe("app CORS unit tests", () => {
    it("allows non-browser / same-origin requests where origin is undefined", () => {
        assert.equal(isAllowedOrigin(undefined), true)
        assert.equal(isAllowedOrigin(""), true)
    })

    it("allows local dev origins", () => {
        assert.equal(isAllowedOrigin("http://localhost:5173"), true)
        assert.equal(isAllowedOrigin("http://localhost:3000"), true)
        assert.equal(isAllowedOrigin("http://127.0.0.1:5173"), true)
        assert.equal(isAllowedOrigin("http://127.0.0.1:3000"), true)
    })

    it("allows production Vercel frontend origin with or without trailing slash", () => {
        assert.equal(isAllowedOrigin("https://rank-resume-alpha.vercel.app"), true)
        assert.equal(isAllowedOrigin("https://rank-resume-alpha.vercel.app/"), true)
    })

    it("allows any Vercel preview deployment origin (*.vercel.app)", () => {
        assert.equal(isAllowedOrigin("https://rank-resume-git-feature.vercel.app"), true)
        assert.equal(isAllowedOrigin("https://preview-12345.vercel.app/"), true)
    })

    it("rejects unauthorized origins and domain spoofing attempts", () => {
        assert.equal(isAllowedOrigin("https://malicious-site.com"), false)
        assert.equal(isAllowedOrigin("https://vercel.app.attacker.com"), false)
        assert.equal(isAllowedOrigin("https://attacker-vercel.app"), false)
        assert.equal(isAllowedOrigin("not-a-valid-url"), false)
    })
})
