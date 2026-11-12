require("dotenv").config()

const { describe, it, before, after } = require("node:test")
const assert = require("node:assert/strict")
const http = require("node:http")
const crypto = require("node:crypto")
const mongoose = require("mongoose")
const jwt = require("jsonwebtoken")
const pdfParse = require("pdf-parse")

const connectToDB = require("../../src/config/database")
const app = require("../../src/app")
const userModel = require("../../src/models/user.model")
const interviewReportModel = require("../../src/models/interviewReport.model")
const tokenBlacklistModel = require("../../src/models/blacklist.model")
const { createValidPdfBuffer, createValidDocxBuffer } = require("../helpers/fixtures")

const RUN_ID = `audit_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`
const USER_A = {
    username: `${RUN_ID}_a`,
    email: `${RUN_ID}_a@example.com`,
    password: "StrongPassword123!",
}
const USER_B = {
    username: `${RUN_ID}_b`,
    email: `${RUN_ID}_b@example.com`,
    password: "StrongPassword456!",
}

let server
let baseUrl
let userAId
let userACookie
let userAToken
let userBCookie
let userBId
const createdReportIds = []
const createdTokens = []

function extractTokenCookie(setCookieHeaders) {
    const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : setCookieHeaders ? [setCookieHeaders] : []
    const tokenLine = list.find((line) => line.startsWith("token="))
    if (!tokenLine) return null
    const value = tokenLine.split(";")[0].slice("token=".length)
    return { raw: tokenLine, cookieHeader: `token=${value}`, token: value }
}

async function parseJson(res) {
    const text = await res.text()
    try {
        return { json: JSON.parse(text), text }
    } catch {
        return { json: null, text }
    }
}

describe("Backend API, Auth, Security, Resume & DB Integration Tests", () => {
    before(async () => {
        process.env.DISABLE_RATE_LIMIT = "true"
        await connectToDB()
        server = http.createServer(app)
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
        const { port } = server.address()
        baseUrl = `http://127.0.0.1:${port}`
    })

    after(async () => {
        delete process.env.DISABLE_RATE_LIMIT
        try {
            if (createdReportIds.length > 0) {
                await interviewReportModel.deleteMany({ _id: { $in: createdReportIds } })
            }
            const userIds = [userAId, userBId].filter(Boolean)
            if (userIds.length > 0) {
                await interviewReportModel.deleteMany({ user: { $in: userIds } })
                await userModel.deleteMany({ _id: { $in: userIds } })
            }
            await userModel.deleteMany({ email: { $regex: `^${RUN_ID}` } })
            if (createdTokens.length > 0) {
                await tokenBlacklistModel.deleteMany({ token: { $in: createdTokens } })
            }
        } finally {
            if (server) {
                await new Promise((resolve) => server.close(resolve))
            }
            await mongoose.disconnect()
        }
    })

    it("health check returns 200 with security headers and omits X-Powered-By", async () => {
        const res = await fetch(`${baseUrl}/api/health`)
        assert.equal(res.status, 200)
        const data = await res.json()
        assert.equal(data.status, "ok")
        assert.equal(res.headers.get("x-powered-by"), null)
        assert.equal(res.headers.get("x-content-type-options"), "nosniff")
        assert.equal(res.headers.get("x-frame-options"), "DENY")
    })

    it("returns clean JSON 404 for unknown API routes", async () => {
        const res = await fetch(`${baseUrl}/api/does-not-exist`)
        assert.equal(res.status, 404)
        const { json } = await parseJson(res)
        assert.equal(json?.message, "Route not found.")
    })

    it("enforces registration validation, creates hardened HttpOnly cookies, and rejects duplicates", async () => {
        const weakRes = await fetch(`${baseUrl}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "ab", email: "bad", password: "123" }),
        })
        assert.equal(weakRes.status, 400)

        const nosqlRegRes = await fetch(`${baseUrl}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: `${RUN_ID}_bad`, email: { $ne: null }, password: "Password123!" }),
        })
        assert.equal(nosqlRegRes.status, 400)

        const regA = await fetch(`${baseUrl}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(USER_A),
        })
        assert.equal(regA.status, 201)
        const bodyA = await regA.json()
        assert.ok(bodyA.user?.id)
        assert.equal(bodyA.user.email, USER_A.email.toLowerCase())
        assert.equal(bodyA.user.password, undefined)
        userAId = bodyA.user.id

        const cookieInfo = extractTokenCookie(regA.headers.getSetCookie())
        assert.ok(cookieInfo)
        assert.match(cookieInfo.raw, /HttpOnly/i)
        assert.match(cookieInfo.raw, /SameSite=Lax/i)
        assert.match(cookieInfo.raw, /Max-Age=86400/i)
        userACookie = cookieInfo.cookieHeader
        userAToken = cookieInfo.token
        createdTokens.push(cookieInfo.token)

        const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: `${RUN_ID}_dup`,
                email: USER_A.email.toUpperCase(),
                password: USER_A.password,
            }),
        })
        assert.equal(dupRes.status, 400)

        const regB = await fetch(`${baseUrl}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(USER_B),
        })
        assert.equal(regB.status, 201)
        const bodyB = await regB.json()
        userBId = bodyB.user.id
        const cookieB = extractTokenCookie(regB.headers.getSetCookie())
        assert.ok(cookieB)
        userBCookie = cookieB.cookieHeader
        createdTokens.push(cookieB.token)
    })

    it("blocks NoSQL injection and invalid credentials on login, allows case-insensitive email login", async () => {
        const nosqlLogin = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: { $ne: null }, password: USER_A.password }),
        })
        assert.equal(nosqlLogin.status, 400)

        const wrongPass = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: USER_A.email, password: "WrongPassword!" }),
        })
        assert.equal(wrongPass.status, 400)

        const okLogin = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: USER_A.email.toUpperCase(), password: USER_A.password }),
        })
        assert.equal(okLogin.status, 200)
        const loginCookie = extractTokenCookie(okLogin.headers.getSetCookie())
        assert.ok(loginCookie)
        userACookie = loginCookie.cookieHeader
        userAToken = loginCookie.token
        createdTokens.push(loginCookie.token)
    })

    it("protects /api/auth/get-me against missing/tampered/blacklisted tokens and deleted users", async () => {
        const noAuth = await fetch(`${baseUrl}/api/auth/get-me`)
        assert.equal(noAuth.status, 401)

        const badJwt = await fetch(`${baseUrl}/api/auth/get-me`, {
            headers: { Cookie: "token=tampered.jwt.token" },
        })
        assert.equal(badJwt.status, 401)

        const meRes = await fetch(`${baseUrl}/api/auth/get-me`, {
            headers: { Cookie: userACookie },
        })
        assert.equal(meRes.status, 200)
        const meData = await meRes.json()
        assert.equal(meData.user.username, USER_A.username)

        // Deleted user still holding signed JWT -> 401 (not 500)
        const tempUser = await userModel.create({
            username: `${RUN_ID}_deleted`,
            email: `${RUN_ID}_deleted@example.com`,
            password: "hashedpassword",
        })
        const tempToken = jwt.sign({ id: tempUser._id.toString(), username: tempUser.username }, process.env.JWT_SECRET, { expiresIn: "1h" })
        await userModel.deleteOne({ _id: tempUser._id })

        const deletedUserRes = await fetch(`${baseUrl}/api/auth/get-me`, {
            headers: { Cookie: `token=${tempToken}` },
        })
        assert.equal(deletedUserRes.status, 401)

        // Logout invalidates the current token via DB blacklist
        const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
            headers: { Cookie: userACookie },
        })
        assert.equal(logoutRes.status, 200)

        const reuseAfterLogout = await fetch(`${baseUrl}/api/auth/get-me`, {
            headers: { Cookie: userACookie },
        })
        assert.equal(reuseAfterLogout.status, 401)

        // Re-authenticate User A for subsequent report tests
        const reLogin = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: USER_A.email, password: USER_A.password }),
        })
        assert.equal(reLogin.status, 200)
        const refreshed = extractTokenCookie(reLogin.headers.getSetCookie())
        userACookie = refreshed.cookieHeader
        userAToken = refreshed.token
        createdTokens.push(userAToken)
    })

    it("rejects invalid report payloads, unsupported files, corrupt files, and >5MB files cleanly with JSON 400", async () => {
        // Missing job description
        const noJdForm = new FormData()
        noJdForm.append("selfDescription", "5 years React")
        const noJdRes = await fetch(`${baseUrl}/api/interview/`, {
            method: "POST",
            headers: { Cookie: userACookie },
            body: noJdForm,
        })
        assert.equal(noJdRes.status, 400)

        // Missing both resume file and selfDescription
        const noProfileForm = new FormData()
        noProfileForm.append("jobDescription", "Senior Node.js Engineer")
        const noProfileRes = await fetch(`${baseUrl}/api/interview/`, {
            method: "POST",
            headers: { Cookie: userACookie },
            body: noProfileForm,
        })
        assert.equal(noProfileRes.status, 400)

        // Unsupported .txt file
        const txtForm = new FormData()
        txtForm.append("jobDescription", "Senior Node.js Engineer")
        txtForm.append("resume", new Blob(["plain text"], { type: "text/plain" }), "resume.txt")
        const txtRes = await fetch(`${baseUrl}/api/interview/`, {
            method: "POST",
            headers: { Cookie: userACookie },
            body: txtForm,
        })
        assert.equal(txtRes.status, 400)
        const { json: txtJson } = await parseJson(txtRes)
        assert.ok(txtJson?.message)

        // Corrupt PDF
        const corruptPdfForm = new FormData()
        corruptPdfForm.append("jobDescription", "Senior Node.js Engineer")
        corruptPdfForm.append("resume", new Blob(["%PDF-1.4 corrupt"], { type: "application/pdf" }), "bad.pdf")
        const corruptPdfRes = await fetch(`${baseUrl}/api/interview/`, {
            method: "POST",
            headers: { Cookie: userACookie },
            body: corruptPdfForm,
        })
        assert.equal(corruptPdfRes.status, 400)

        // Oversized (>5MB) PDF -> JSON 400 (never HTML 500)
        const bigForm = new FormData()
        bigForm.append("jobDescription", "Senior Node.js Engineer")
        bigForm.append("resume", new Blob([Buffer.alloc(5.2 * 1024 * 1024, 0x41)], { type: "application/pdf" }), "huge.pdf")
        const bigRes = await fetch(`${baseUrl}/api/interview/`, {
            method: "POST",
            headers: { Cookie: userACookie },
            body: bigForm,
        })
        assert.equal(bigRes.status, 400)
        const { json: bigJson } = await parseJson(bigRes)
        assert.match(bigJson?.message || "", /5MB/i)
    })

    it("generates meaningful structured interview reports from PDF, DOCX, and selfDescription, blocks IDOR, and renders tailored PDF", async () => {
        const jd = "Senior Full-Stack Engineer requiring 5+ years of React, TypeScript, Node.js, MongoDB, Redis caching, Docker, and system design experience."

        // 1. Real PDF upload + Gemini AI generation
        const pdfBuffer = createValidPdfBuffer(
            "Avery Rivera Senior Full-Stack Developer. 6 years React TypeScript Node.js Express MongoDB PostgreSQL REST APIs."
        )
        const pdfForm = new FormData()
        pdfForm.append("jobDescription", jd)
        pdfForm.append("resume", new Blob([pdfBuffer], { type: "application/pdf" }), "avery_resume.pdf")

        const pdfReportRes = await fetch(`${baseUrl}/api/interview/`, {
            method: "POST",
            headers: { Cookie: userACookie },
            body: pdfForm,
        })
        assert.equal(pdfReportRes.status, 201)
        const pdfReportBody = await pdfReportRes.json()
        const pdfReport = pdfReportBody.interviewReport
        assert.ok(pdfReport?._id)
        createdReportIds.push(pdfReport._id)

        assert.equal(typeof pdfReport.title, "string")
        assert.ok(pdfReport.title.trim().length > 2)
        assert.equal(typeof pdfReport.matchScore, "number")
        assert.ok(pdfReport.matchScore >= 0 && pdfReport.matchScore <= 100)
        assert.ok(Array.isArray(pdfReport.technicalQuestions) && pdfReport.technicalQuestions.length >= 3)
        assert.ok(Array.isArray(pdfReport.behavioralQuestions) && pdfReport.behavioralQuestions.length >= 2)
        assert.ok(Array.isArray(pdfReport.skillGaps))
        assert.ok(Array.isArray(pdfReport.preparationPlan) && pdfReport.preparationPlan.length >= 3)
        assert.match(pdfReport.resume, /Avery Rivera/)

        // 2. Real DOCX upload + Gemini AI generation
        const docxBuffer = createValidDocxBuffer([
            "Jordan Kim - Backend Platform Engineer",
            "Experience: Node.js, Express, MongoDB, GraphQL, Kubernetes",
        ])
        const docxForm = new FormData()
        docxForm.append("jobDescription", jd)
        docxForm.append(
            "resume",
            new Blob([docxBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
            "jordan_resume.docx"
        )
        const docxReportRes = await fetch(`${baseUrl}/api/interview/`, {
            method: "POST",
            headers: { Cookie: userACookie },
            body: docxForm,
        })
        assert.equal(docxReportRes.status, 201)
        const docxReportBody = await docxReportRes.json()
        createdReportIds.push(docxReportBody.interviewReport._id)
        assert.match(docxReportBody.interviewReport.resume, /Jordan Kim/)

        // 3. Self-description only (no file)
        const selfForm = new FormData()
        selfForm.append("jobDescription", jd)
        selfForm.append("selfDescription", "Frontend engineer with 4 years React and JavaScript, transitioning to full-stack Node.js.")
        const selfReportRes = await fetch(`${baseUrl}/api/interview/`, {
            method: "POST",
            headers: { Cookie: userACookie },
            body: selfForm,
        })
        assert.equal(selfReportRes.status, 201)
        const selfReportBody = await selfReportRes.json()
        createdReportIds.push(selfReportBody.interviewReport._id)

        // 4. Report listing & ObjectId validation & cross-user IDOR
        const listARes = await fetch(`${baseUrl}/api/interview/`, { headers: { Cookie: userACookie } })
        assert.equal(listARes.status, 200)
        const listABody = await listARes.json()
        assert.equal(listABody.interviewReports.length, 3)

        const listBRes = await fetch(`${baseUrl}/api/interview/`, { headers: { Cookie: userBCookie } })
        assert.equal(listBRes.status, 200)
        const listBBody = await listBRes.json()
        assert.equal(listBBody.interviewReports.length, 0)

        const invalidIdRes = await fetch(`${baseUrl}/api/interview/report/not-valid-objectid`, {
            headers: { Cookie: userACookie },
        })
        assert.equal(invalidIdRes.status, 400)

        const ownerGetRes = await fetch(`${baseUrl}/api/interview/report/${pdfReport._id}`, {
            headers: { Cookie: userACookie },
        })
        assert.equal(ownerGetRes.status, 200)

        const idorGetRes = await fetch(`${baseUrl}/api/interview/report/${pdfReport._id}`, {
            headers: { Cookie: userBCookie },
        })
        assert.equal(idorGetRes.status, 404)

        // 5. Resume PDF generation: IDOR blocked + Invalid ID 400 + Owner generates readable PDF
        const invalidPdfIdRes = await fetch(`${baseUrl}/api/interview/resume/pdf/bad-id-123`, {
            method: "POST",
            headers: { Cookie: userACookie },
        })
        assert.equal(invalidPdfIdRes.status, 400)

        const idorPdfRes = await fetch(`${baseUrl}/api/interview/resume/pdf/${pdfReport._id}`, {
            method: "POST",
            headers: { Cookie: userBCookie },
        })
        assert.equal(idorPdfRes.status, 404)

        const ownerPdfRes = await fetch(`${baseUrl}/api/interview/resume/pdf/${pdfReport._id}`, {
            method: "POST",
            headers: { Cookie: userACookie },
        })
        assert.equal(ownerPdfRes.status, 200)
        assert.match(ownerPdfRes.headers.get("content-type") || "", /application\/pdf/)
        const pdfArrayBuf = await ownerPdfRes.arrayBuffer()
        const generatedPdfBuf = Buffer.from(pdfArrayBuf)
        assert.equal(generatedPdfBuf.subarray(0, 5).toString("ascii"), "%PDF-")

        const parser = new pdfParse.PDFParse({ data: Uint8Array.from(generatedPdfBuf) })
        const extractedPdf = await parser.getText()
        await parser.destroy()
        assert.ok((extractedPdf?.text || "").trim().length > 150, "Generated tailored PDF must contain readable resume content")
        assert.match(extractedPdf.text, /Avery Rivera|React|Node/i)
    })

    it("enforces auth rate limiting when DISABLE_RATE_LIMIT is off", async () => {
        delete process.env.DISABLE_RATE_LIMIT
        let hit429 = false
        for (let i = 0; i < 32; i++) {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: USER_A.email, password: "WrongPassword!" }),
            })
            if (res.status === 429) {
                hit429 = true
                assert.ok(res.headers.get("retry-after"))
                break
            }
        }
        assert.equal(hit429, true, "Expected 429 rate-limit response after excessive failed logins")
        process.env.DISABLE_RATE_LIMIT = "true"
    })
})

