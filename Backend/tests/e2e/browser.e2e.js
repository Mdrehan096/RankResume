require("dotenv").config()

const { describe, it, before, after } = require("node:test")
const assert = require("node:assert/strict")
const http = require("node:http")
const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")
const crypto = require("node:crypto")
const { execFileSync } = require("node:child_process")
const mongoose = require("mongoose")
const puppeteer = require("puppeteer")

const connectToDB = require("../../src/config/database")
const userModel = require("../../src/models/user.model")
const interviewReportModel = require("../../src/models/interviewReport.model")
const tokenBlacklistModel = require("../../src/models/blacklist.model")
const { createValidPdfBuffer, createValidDocxBuffer } = require("../helpers/fixtures")

const RUN_ID = `e2e_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`
const USER_1 = {
    username: `${RUN_ID}_u1`,
    email: `${RUN_ID}_u1@example.com`,
    password: "E2ePassword123!",
}
const USER_2 = {
    username: `${RUN_ID}_u2`,
    email: `${RUN_ID}_u2@example.com`,
    password: "E2ePassword456!",
}

const MIME_MAP = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".json": "application/json",
}

function createSpaStaticServer(distDir) {
    return http.createServer((req, res) => {
        const cleanPath = (req.url || "/").split("?")[0]
        const relativePath = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "")
        let filePath = path.resolve(distDir, relativePath)

        // Prevent path traversal outside distDir
        if (!filePath.startsWith(path.resolve(distDir))) {
            res.statusCode = 403
            return res.end("Forbidden")
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            filePath = path.join(distDir, "index.html")
        }

        const ext = path.extname(filePath).toLowerCase()
        res.setHeader("Content-Type", MIME_MAP[ext] || "application/octet-stream")
        fs.createReadStream(filePath).pipe(res)
    })
}

async function waitForText(page, selector, pattern, timeout = 15000) {
    await page.waitForFunction(
        (sel, regexSrc) => {
            const el = document.querySelector(sel)
            return el && new RegExp(regexSrc, "i").test(el.textContent || "")
        },
        { timeout },
        selector,
        pattern.source
    )
}

describe("Full-Stack Frontend Component & Browser E2E Verification", () => {
    let tmpRoot
    let tmpDist
    let tmpUploads
    let tmpDownloads
    let feServer
    let beServer
    let feUrl
    let browser
    let createdReportId
    const createdTokens = []
    const pageErrors = []
    const consoleErrors = []
    const server5xx = []

    before(async () => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rankresume-e2e-"))
        tmpDist = path.join(tmpRoot, "dist")
        tmpUploads = path.join(tmpRoot, "uploads")
        tmpDownloads = path.join(tmpRoot, "downloads")
        fs.mkdirSync(tmpDist, { recursive: true })
        fs.mkdirSync(tmpUploads, { recursive: true })
        fs.mkdirSync(tmpDownloads, { recursive: true })

        feServer = createSpaStaticServer(tmpDist)
        await new Promise((resolve) => feServer.listen(0, "127.0.0.1", resolve))
        const { port: fePort } = feServer.address()
        feUrl = `http://127.0.0.1:${fePort}`

        process.env.CLIENT_URL = feUrl
        process.env.DISABLE_RATE_LIMIT = "true"

        await connectToDB()
        const app = require("../../src/app")
        beServer = http.createServer(app)
        await new Promise((resolve) => beServer.listen(0, "127.0.0.1", resolve))
        const { port: bePort } = beServer.address()
        const beUrl = `http://127.0.0.1:${bePort}`

        const frontendDir = path.resolve(__dirname, "../../../Frontend")
        const viteBin = path.join(frontendDir, "node_modules", "vite", "bin", "vite.js")
        execFileSync(
            process.execPath,
            [viteBin, "build", "--outDir", tmpDist, "--emptyOutDir"],
            {
                cwd: frontendDir,
                env: { ...process.env, VITE_API_URL: beUrl },
                stdio: "pipe",
            }
        )

        browser = await puppeteer.launch({
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        })
    })

    after(async () => {
        delete process.env.DISABLE_RATE_LIMIT
        if (browser) {
            await browser.close().catch(() => {})
        }
        if (beServer) {
            await new Promise((resolve) => beServer.close(resolve))
        }
        if (feServer) {
            await new Promise((resolve) => feServer.close(resolve))
        }

        try {
            const users = await userModel.find({
                email: { $in: [USER_1.email.toLowerCase(), USER_2.email.toLowerCase()] },
            })
            const userIds = users.map((u) => u._id)
            if (userIds.length > 0) {
                await interviewReportModel.deleteMany({ user: { $in: userIds } })
                await userModel.deleteMany({ _id: { $in: userIds } })
            }
            if (createdReportId) {
                await interviewReportModel.deleteMany({ _id: createdReportId })
            }
            if (createdTokens.length > 0) {
                await tokenBlacklistModel.deleteMany({ token: { $in: createdTokens } })
            }
        } finally {
            await mongoose.disconnect().catch(() => {})
            if (tmpRoot && fs.existsSync(tmpRoot)) {
                fs.rmSync(tmpRoot, { recursive: true, force: true })
            }
        }
    })

    it("executes complete registration, upload, AI interview plan, resume PDF export, error states, and logout isolation without browser runtime errors", async () => {
        const page = await browser.newPage()
        await page.setViewport({ width: 1280, height: 800 })

        const cdp = await page.createCDPSession()
        await cdp.send("Page.setDownloadBehavior", {
            behavior: "allow",
            downloadPath: tmpDownloads,
        })

        page.on("pageerror", (err) => pageErrors.push(err.message))
        page.on("console", (msg) => {
            if (msg.type() === "error") {
                const text = msg.text()
                // Ignore intentional 4xx HTTP resource log from invalid login / 404 tests; fail on app/runtime errors
                if (!/status of 40[014]/i.test(text)) {
                    consoleErrors.push(text)
                }
            }
        })
        page.on("response", (res) => {
            if (res.status() >= 500) {
                server5xx.push(`${res.status()} ${res.url()}`)
            }
        })

        // 1. Unauthenticated access to "/" redirects cleanly to "/login"
        await page.goto(`${feUrl}/`, { waitUntil: "networkidle0" })
        assert.match(page.url(), /\/login$/)
        assert.match(await page.title(), /^RankResume/)

        // 2. Navigate to "/register", test validation, then create User 1
        await page.click('a[href="/register"]')
        await page.waitForSelector('form input[name="username"]')
        await page.type('input[name="username"]', "ab")
        await page.type('input[name="email"]', USER_1.email)
        await page.type('input[name="password"]', USER_1.password)
        await page.click('button[type="submit"]')
        await waitForText(page, '[role="alert"]', /at least 3 characters/)

        await page.click('input[name="username"]', { clickCount: 3 })
        await page.type('input[name="username"]', USER_1.username)
        await Promise.all([
            page.waitForFunction(() => window.location.pathname === "/", { timeout: 15000 }),
            page.click('button[type="submit"]'),
        ])
        assert.equal(new URL(page.url()).pathname, "/")
        await waitForText(page, ".home-topbar__user", new RegExp(USER_1.username))

        // 3. Authenticated user visiting /login redirects back to "/"
        await page.goto(`${feUrl}/login`, { waitUntil: "networkidle0" })
        assert.equal(new URL(page.url()).pathname, "/")

        // 4. Home Page interactions: char counter, modal footer, validation, DOCX/PDF/txt handling
        const sampleJd = "Senior Full-Stack Engineer needing React, TypeScript, Node.js, MongoDB, Redis, and Docker."
        await page.type('textarea[aria-label="Target Job Description"]', sampleJd)
        await waitForText(page, ".char-counter", new RegExp(`${sampleJd.length} / 5000 chars`))

        // Footer modal works (no dead # links)
        await page.click('footer.page-footer button')
        await page.waitForSelector('[role="dialog"]')
        await page.click('.info-modal__close')
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'))

        // Validation: missing profile shows inline error while preserving jobDescription
        await page.click('.generate-btn')
        await waitForText(page, '[role="alert"]', /upload a resume|self-description/i)
        const preservedJd = await page.$eval('textarea[aria-label="Target Job Description"]', (el) => el.value)
        assert.equal(preservedJd, sampleJd)

        // Upload unsupported .txt -> client validation rejects cleanly
        const txtPath = path.join(tmpUploads, "bad.txt")
        fs.writeFileSync(txtPath, "hello")
        const fileInput = await page.$('input#resume')
        await fileInput.uploadFile(txtPath)
        await waitForText(page, '[role="alert"]', /Unsupported file type/i)

        // Upload valid DOCX, see filename + Remove file, then switch to valid PDF
        const docxPath = path.join(tmpUploads, "candidate.docx")
        fs.writeFileSync(docxPath, createValidDocxBuffer(["Taylor Brooks", "Skills: React, Node.js"]))
        await (await page.$('input#resume')).uploadFile(docxPath)
        await waitForText(page, ".selected-file", /candidate\.docx/)

        await page.click(".remove-file-btn")
        await page.waitForFunction(() => !document.querySelector(".selected-file"))

        const pdfPath = path.join(tmpUploads, "taylor_resume.pdf")
        fs.writeFileSync(
            pdfPath,
            createValidPdfBuffer("Taylor Brooks Senior Full Stack Developer. 5 years React TypeScript Node.js Express MongoDB REST APIs.")
        )
        await (await page.$('input#resume')).uploadFile(pdfPath)
        await waitForText(page, ".selected-file", /taylor_resume\.pdf/)

        // 5. Generate real AI interview report and navigate to /interview/:id
        await Promise.all([
            page.waitForFunction(() => /^\/interview\/[a-f0-9]{24}$/i.test(window.location.pathname), { timeout: 60000 }),
            page.click(".generate-btn"),
        ])

        createdReportId = new URL(page.url()).pathname.split("/").pop()
        await page.waitForSelector(".interview-topbar__title")
        const reportTitle = await page.$eval(".interview-topbar__title", (el) => el.textContent.trim())
        assert.ok(reportTitle.length > 0)

        const scoreText = await page.$eval(".match-score__value", (el) => el.textContent.trim())
        const scoreNum = Number(scoreText)
        assert.ok(!Number.isNaN(scoreNum) && scoreNum >= 0 && scoreNum <= 100)

        const techCount = await page.$$eval(".q-card", (els) => els.length)
        assert.ok(techCount >= 3, "Expected at least 3 rendered technical questions")

        // Expand & collapse first question accordion
        await page.click(".q-card__header")
        await page.waitForSelector(".q-card__body")
        await page.click(".q-card__header")
        await page.waitForFunction(() => !document.querySelector(".q-card__body"))

        // Switch to Behavioral Questions and Road Map tabs
        const navButtons = await page.$$(".interview-nav__item")
        await navButtons[1].click()
        await waitForText(page, ".content-header h2", /Behavioral Questions/)
        const behavCount = await page.$$eval(".q-card", (els) => els.length)
        assert.ok(behavCount >= 2)

        await navButtons[2].click()
        await waitForText(page, ".content-header h2", /Preparation Road Map/)
        const dayCount = await page.$$eval(".roadmap-day", (els) => els.length)
        assert.ok(dayCount >= 3)

        // Skill gaps displayed
        const gapCount = await page.$$eval(".skill-tag", (els) => els.length)
        assert.ok(gapCount >= 1)

        // Download tailored PDF resume and inspect actual file on disk
        await page.click(".download-resume-btn")
        await page.waitForFunction(
            () => {
                const btn = document.querySelector(".download-resume-btn")
                return btn && !btn.disabled && /Download Resume/i.test(btn.textContent || "")
            },
            { timeout: 60000 }
        )

        // Wait briefly for Chromium download stream flush
        let pdfFileName = null
        const deadline = Date.now() + 10000
        while (Date.now() < deadline) {
            const files = fs.readdirSync(tmpDownloads).filter((f) => f.endsWith(".pdf"))
            if (files.length > 0) {
                pdfFileName = files[0]
                break
            }
            await new Promise((r) => setTimeout(r, 200))
        }
        assert.ok(pdfFileName, "Expected downloaded PDF file in temp downloads directory")
        const downloadedBytes = fs.readFileSync(path.join(tmpDownloads, pdfFileName))
        assert.equal(downloadedBytes.subarray(0, 5).toString("ascii"), "%PDF-")
        assert.ok(downloadedBytes.length > 10000, "Expected non-trivial generated resume PDF")

        // 6. Navigate back to Dashboard -> Recent Reports renders & navigates cleanly
        await page.click(".interview-topbar .topbar-btn")
        await waitForText(page, ".recent-reports .report-item h3", new RegExp(reportTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))

        // 7. Invalid interview ID displays clean Error Card + Back button (no infinite spinner)
        await page.goto(`${feUrl}/interview/invalid-id-123`, { waitUntil: "networkidle0" })
        await waitForText(page, ".error-state-card h1", /Unable to Load Interview Plan/)
        await page.click(".error-state-card button")
        await page.waitForSelector(".home-topbar")
        assert.equal(new URL(page.url()).pathname, "/")

        // 8. Logout -> Invalid login shows inline alert -> User 2 cannot access User 1 report
        const cookiesBeforeLogout = await page.cookies()
        const authCookie = cookiesBeforeLogout.find((c) => c.name === "token")?.value
        if (authCookie) createdTokens.push(authCookie)

        await page.click(".logout-btn")
        await page.waitForSelector('form input[name="email"]')
        assert.match(page.url(), /\/login$/)

        await page.type('input[name="email"]', USER_1.email)
        await page.type('input[name="password"]', "WrongPassword999!")
        await page.click('button[type="submit"]')
        await waitForText(page, '[role="alert"]', /Invalid email or password/i)
        assert.match(page.url(), /\/login$/)

        // Register User 2 -> Verify 0 reports on Home -> Verify accessing User 1's report shows Error Card
        await page.click('a[href="/register"]')
        await page.waitForSelector('form input[name="username"]')
        await page.type('input[name="username"]', USER_2.username)
        await page.type('input[name="email"]', USER_2.email)
        await page.type('input[name="password"]', USER_2.password)
        await Promise.all([
            page.waitForFunction(() => window.location.pathname === "/", { timeout: 15000 }),
            page.click('button[type="submit"]'),
        ])
        assert.equal(new URL(page.url()).pathname, "/")
        const user2ReportCount = await page.$$eval(".report-item", (els) => els.length)
        assert.equal(user2ReportCount, 0)

        await page.goto(`${feUrl}/interview/${createdReportId}`, { waitUntil: "networkidle0" })
        await waitForText(page, ".error-state-card h1", /Unable to Load Interview Plan/)

        // Assert ZERO uncaught runtime/page/console/5xx errors across entire journey
        assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join("; ")}`)
        assert.deepEqual(consoleErrors, [], `Unexpected console errors: ${consoleErrors.join("; ")}`)
        assert.deepEqual(server5xx, [], `Unexpected 5xx responses: ${server5xx.join("; ")}`)
    })
})
