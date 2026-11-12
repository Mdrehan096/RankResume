const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const { z } = require("zod")
const {
    sanitizeResumeHtml,
    interviewReportSchema,
    resumePdfSchema,
} = require("../../src/services/ai.service")

describe("ai.service unit tests", () => {
    it("sanitizes dangerous tags, event handlers, and javascript URLs while preserving resume layout", () => {
        const malicious = `
            <html>
                <head><style>body { font-family: Arial; }</style><meta http-equiv="refresh" content="0;url=http://evil.com"></head>
                <body onload="alert(1)">
                    <h1 onclick="steal()">Candidate Name</h1>
                    <script>fetch("http://evil.com")</script>
                    <iframe src="http://evil.com"></iframe>
                    <a href="javascript:alert('xss')">Portfolio</a>
                    <a href='javascript:alert("xss2")'>Portfolio 2</a>
                    <a href=javascript:alert(3)>Portfolio 3</a>
                    <img src="x" onerror='alert(2)' />
                    <p>Experienced Backend Engineer</p>
                </body>
            </html>
        `
        const clean = sanitizeResumeHtml(malicious)
        assert.doesNotMatch(clean, /<script/i)
        assert.doesNotMatch(clean, /<iframe/i)
        assert.doesNotMatch(clean, /<meta/i)
        assert.doesNotMatch(clean, /\sonload=/i)
        assert.doesNotMatch(clean, /\sonclick=/i)
        assert.doesNotMatch(clean, /\sonerror=/i)
        assert.doesNotMatch(clean, /javascript:/i)
        assert.match(clean, /<style>body \{ font-family: Arial; \}<\/style>/)
        assert.match(clean, /<h1>Candidate Name<\/h1>/i)
        assert.match(clean, /<p>Experienced Backend Engineer<\/p>/)
    })

    it("produces non-empty JSON Schema from Zod v4 schemas", () => {
        const reportJson = z.toJSONSchema(interviewReportSchema)
        assert.ok(reportJson.properties)
        for (const field of ["matchScore", "technicalQuestions", "behavioralQuestions", "skillGaps", "preparationPlan", "title"]) {
            assert.ok(reportJson.properties[field], `Expected JSON schema property: ${field}`)
        }

        const pdfJson = z.toJSONSchema(resumePdfSchema)
        assert.ok(pdfJson.properties?.html)
    })

    it("validates structured interview reports and rejects malformed payloads", () => {
        const validReport = {
            title: "Senior Full-Stack Engineer",
            matchScore: 84,
            technicalQuestions: [
                {
                    question: "How do you prevent race conditions in distributed queues?",
                    intention: "Assess concurrency design skills.",
                    answer: "Use idempotency keys and distributed locks or transactional outbox.",
                },
            ],
            behavioralQuestions: [
                {
                    question: "Tell me about a production outage you led.",
                    intention: "Evaluate ownership and incident communication.",
                    answer: "Use STAR: Situation, Task, Action, Result.",
                },
            ],
            skillGaps: [
                { skill: "Kubernetes Operators", severity: "medium" },
            ],
            preparationPlan: [
                { day: 1, focus: "System Design", tasks: ["Review caching and queueing patterns"] },
            ],
        }
        assert.equal(interviewReportSchema.safeParse(validReport).success, true)

        const badReport = { ...validReport, matchScore: 150, skillGaps: [{ skill: "Go", severity: "critical" }] }
        assert.equal(interviewReportSchema.safeParse(badReport).success, false)
    })
})
