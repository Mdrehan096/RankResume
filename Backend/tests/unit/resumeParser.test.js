const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const {
    extractResumeText,
    extractPdfText,
    extractDocxText,
    isPdfBuffer,
    isZipBuffer,
} = require("../../src/utils/resumeParser")
const { createValidPdfBuffer, createZipBuffer, createValidDocxBuffer } = require("../helpers/fixtures")

describe("resumeParser unit tests", () => {
    it("detects PDF and ZIP magic bytes accurately", () => {
        assert.equal(isPdfBuffer(Buffer.from("%PDF-1.7 test")), true)
        assert.equal(isPdfBuffer(Buffer.from("plain text")), false)
        assert.equal(isZipBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])), true)
        assert.equal(isZipBuffer(Buffer.from("not a zip")), false)
    })

    it("extracts readable text from a valid PDF buffer", async () => {
        const pdf = createValidPdfBuffer("Avery Patel Senior React Node Engineer")
        const text = await extractResumeText({
            originalname: "resume.pdf",
            mimetype: "application/pdf",
            buffer: pdf,
        })
        assert.match(text, /Avery Patel/)
        assert.match(text, /React Node Engineer/)
    })

    it("extracts text and decodes XML entities from a deflated DOCX buffer", async () => {
        const docx = createValidDocxBuffer([
            "Morgan Lee &amp; Co &lt;Lead Architect&gt;",
            "Built distributed systems with TypeScript&#x27;s type system",
        ])
        const text = await extractResumeText({
            originalname: "resume.docx",
            mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            buffer: docx,
        })
        assert.match(text, /Morgan Lee & Co <Lead Architect>/)
        assert.match(text, /TypeScript's type system/)
    })

    it("extracts text from stored (method 0) DOCX plus header XML", () => {
        const docx = createZipBuffer([
            { name: "word/header1.xml", method: 0, data: "<w:hdr><w:p><w:r><w:t>CONFIDENTIAL HEADER</w:t></w:r></w:p></w:hdr>" },
            { name: "word/document.xml", method: 0, data: "<w:document><w:body><w:p><w:r><w:t>Main Resume Body</w:t></w:r></w:p></w:body></w:document>" },
        ])
        const text = extractDocxText(docx)
        assert.ok(text.startsWith("Main Resume Body"))
        assert.match(text, /CONFIDENTIAL HEADER/)
    })

    it("rejects empty files and unsupported extensions with 400 AppError", async () => {
        await assert.rejects(
            () => extractResumeText({ originalname: "empty.pdf", mimetype: "application/pdf", buffer: Buffer.alloc(0) }),
            (err) => err.statusCode === 400 && /empty/i.test(err.message)
        )
        await assert.rejects(
            () => extractResumeText({ originalname: "notes.txt", mimetype: "text/plain", buffer: Buffer.from("hello") }),
            (err) => err.statusCode === 400 && /Only PDF and DOCX/i.test(err.message)
        )
    })

    it("rejects spoofed or corrupt PDF buffers with 400", async () => {
        await assert.rejects(
            () => extractPdfText(Buffer.from("not-a-pdf")),
            (err) => err.statusCode === 400
        )
        await assert.rejects(
            () => extractPdfText(Buffer.from("%PDF-1.4 corrupted-garbage")),
            (err) => err.statusCode === 400
        )
    })

    it("rejects corrupt DOCX, missing document.xml, corrupt deflate stream, and zip bombs", () => {
        assert.throws(
            () => extractDocxText(Buffer.from("PK\x03\x04broken-without-eocd")),
            (err) => err.statusCode === 400
        )

        const missingDocXml = createZipBuffer([
            { name: "word/styles.xml", data: "<w:styles/>" },
        ])
        assert.throws(
            () => extractDocxText(missingDocXml),
            (err) => err.statusCode === 400 && /valid DOCX/i.test(err.message)
        )

        const zipBombHeader = createZipBuffer([
            { name: "word/document.xml", data: "<w:p/>", declaredUncompressedSize: 50 * 1024 * 1024 },
        ])
        assert.throws(
            () => extractDocxText(zipBombHeader),
            (err) => err.statusCode === 400 && /decompression limit/i.test(err.message)
        )

        const badDeflate = createZipBuffer([
            { name: "word/document.xml", data: "<w:p>test</w:p>", corruptDeflate: true },
        ])
        assert.throws(
            () => extractDocxText(badDeflate),
            (err) => err.statusCode === 400 && /Corrupt or invalid DOCX/i.test(err.message)
        )
    })
})

