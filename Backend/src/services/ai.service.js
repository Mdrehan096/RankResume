const { GoogleGenAI } = require("@google/genai")
const { z } = require("zod")
const puppeteer = require("puppeteer")
const AppError = require("../utils/appError")

const interviewReportSchema = z.object({
    matchScore: z.number().min(0).max(100).describe("An integer score between 0 and 100 indicating how well the candidate's profile matches the job description"),
    technicalQuestions: z.array(z.object({
        question: z.string().min(1).describe("Technical question that can be asked in the interview"),
        intention: z.string().min(1).describe("The intention of the interviewer behind asking this question"),
        answer: z.string().min(1).describe("How to answer this question, what points to cover, and what approach to take")
    })).min(1).describe("Technical questions that can be asked in the interview along with their intention and model answer"),
    behavioralQuestions: z.array(z.object({
        question: z.string().min(1).describe("Behavioral question that can be asked in the interview"),
        intention: z.string().min(1).describe("The intention of the interviewer behind asking this question"),
        answer: z.string().min(1).describe("How to answer this question using structured examples such as STAR")
    })).min(1).describe("Behavioral questions that can be asked in the interview along with their intention and model answer"),
    skillGaps: z.array(z.object({
        skill: z.string().min(1).describe("The skill which the candidate is lacking or needs to strengthen"),
        severity: z.enum(["low", "medium", "high"]).describe("The severity of this skill gap for the target job")
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().int().min(1).describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().min(1).describe("The main focus of this day in the preparation plan"),
        tasks: z.array(z.string().min(1)).min(1).describe("Actionable tasks to complete on this day")
    })).min(1).describe("A day-wise preparation plan for the candidate"),
    title: z.string().min(1).describe("A concise job title extracted from the job description"),
})

const resumePdfSchema = z.object({
    html: z.string().min(20).describe("Complete HTML document with embedded CSS representing a clean 1-2 page ATS-friendly resume")
})

function buildJsonSchema(zodSchema) {
    const jsonSchema = z.toJSONSchema(zodSchema)
    delete jsonSchema.$schema
    return jsonSchema
}

function getGenAiClient() {
    if (!process.env.GOOGLE_GENAI_API_KEY) {
        throw new AppError(500, "AI service is not configured.")
    }
    return new GoogleGenAI({
        apiKey: process.env.GOOGLE_GENAI_API_KEY
    })
}

function sanitizeResumeHtml(html) {
    if (typeof html !== "string") {
        return ""
    }

    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
        .replace(/<(object|embed|applet|base)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
        .replace(/<(iframe|object|embed|applet|base|meta)\b[^>]*\/?>/gi, "")
        .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(
            /(href|src|action)\s*=\s*(?:"\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*'|(?:javascript|vbscript|data:text\/html)[^\s>]*)/gi,
            '$1="#"'
        )
}

async function generateInterviewReport({ resume = "", selfDescription = "", jobDescription }) {
    const ai = getGenAiClient()

    const prompt = `You are a senior technical recruiter and interview coach. Analyze the candidate profile against the target job description and generate a structured interview preparation report in valid JSON.

Evaluation rules:
- Base matchScore (0-100) honestly on how well the candidate's demonstrated skills and experience match the required skills and seniority of the job description.
- Provide specific, tailored technicalQuestions (at least 5) and behavioralQuestions (at least 3) relevant to the job description and candidate profile.
- Identify genuine skillGaps from the job description missing or weak in the candidate's profile with realistic severity ("low", "medium", or "high").
- Provide a practical 5 to 7 day preparationPlan with clear daily focus and concrete tasks.
- Set title to a concise role title for this job description (e.g. "Senior Full-Stack Engineer").

Candidate Resume:
${resume || "Not provided"}

Candidate Self Description:
${selfDescription || "Not provided"}

Target Job Description:
${jobDescription}`

    let response
    try {
        response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseJsonSchema: buildJsonSchema(interviewReportSchema),
            }
        })
    } catch (err) {
        throw new AppError(502, `AI report generation failed: ${err?.message || "Upstream service error"}`)
    }

    let parsedJson
    try {
        parsedJson = JSON.parse(response.text)
    } catch {
        throw new AppError(502, "AI service returned malformed JSON.")
    }

    if (typeof parsedJson?.matchScore === "number") {
        parsedJson.matchScore = Math.round(Math.min(100, Math.max(0, parsedJson.matchScore)))
    }

    const validated = interviewReportSchema.safeParse(parsedJson)
    if (!validated.success) {
        throw new AppError(502, "AI service returned an incomplete interview report.")
    }

    return validated.data
}

async function generatePdfFromHtml(htmlContent) {
    const safeHtml = sanitizeResumeHtml(htmlContent)
    if (!safeHtml.trim()) {
        throw new AppError(502, "Generated resume HTML was empty.")
    }

    const browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    })
    try {
        const page = await browser.newPage()
        await page.setJavaScriptEnabled(false)
        await page.setRequestInterception(true)
        page.on("request", (req) => {
            const url = req.url()
            if (url === "about:blank" || url.startsWith("data:")) {
                req.continue()
            } else {
                req.abort()
            }
        })

        await page.setContent(safeHtml, { waitUntil: "domcontentloaded" })

        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "16mm",
                bottom: "16mm",
                left: "14mm",
                right: "14mm"
            }
        })

        return Buffer.from(pdfBuffer)
    } finally {
        await browser.close()
    }
}

async function generateResumePdf({ resume = "", selfDescription = "", jobDescription }) {
    const ai = getGenAiClient()

    const prompt = `Generate a clean, ATS-friendly, 1-2 page tailored resume as self-contained HTML with inline <style> CSS for the candidate below.

Formatting & safety requirements:
- Return a JSON object with a single "html" field containing a complete HTML document (<!DOCTYPE html><html>...</html>).
- Use only self-contained CSS (no external stylesheets, fonts, images, iframes, or <script> tags).
- Tailor bullet points and summary to the target job description using only factual experience/skills present in the candidate's resume or self-description (do not invent fake employers or degrees).
- Keep the tone authentic, concise, and human-written.

Candidate Resume:
${resume || "Not provided"}

Candidate Self Description:
${selfDescription || "Not provided"}

Target Job Description:
${jobDescription}`

    let response
    try {
        response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseJsonSchema: buildJsonSchema(resumePdfSchema),
            }
        })
    } catch (err) {
        throw new AppError(502, `AI resume generation failed: ${err?.message || "Upstream service error"}`)
    }

    let jsonContent
    try {
        jsonContent = JSON.parse(response.text)
    } catch {
        throw new AppError(502, "AI service returned malformed resume data.")
    }

    const validated = resumePdfSchema.safeParse(jsonContent)
    if (!validated.success) {
        throw new AppError(502, "AI service returned invalid resume HTML.")
    }

    return generatePdfFromHtml(validated.data.html)
}

module.exports = {
    generateInterviewReport,
    generateResumePdf,
    generatePdfFromHtml,
    sanitizeResumeHtml,
    interviewReportSchema,
    resumePdfSchema,
}
