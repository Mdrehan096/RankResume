const zlib = require("zlib")
const pdfParse = require("pdf-parse")
const AppError = require("./appError")

const MAX_DOCX_XML_BYTES = 10 * 1024 * 1024 // 10MB uncompressed XML guard against zip bombs
const MAX_DOCX_ENTRIES = 200

function isPdfBuffer(buffer) {
    return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-"
}

function isZipBuffer(buffer) {
    return (
        buffer.length >= 4 &&
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
    )
}

function decodeXmlEntities(text) {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            const code = parseInt(hex, 16)
            return Number.isFinite(code) ? String.fromCodePoint(code) : ""
        })
        .replace(/&#(\d+);/g, (_, dec) => {
            const code = parseInt(dec, 10)
            return Number.isFinite(code) ? String.fromCodePoint(code) : ""
        })
}

function extractTextFromWordXml(xml) {
    const withBreaks = xml
        .replace(/<\/w:p>/g, "\n")
        .replace(/<w:br[^>]*\/>/g, "\n")
        .replace(/<w:tab[^>]*\/>/g, "\t")
        .replace(/<\/w:tr>/g, "\n")
        .replace(/<\/w:tc>/g, " ")
    const stripped = withBreaks.replace(/<[^>]+>/g, "")
    return decodeXmlEntities(stripped)
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

/**
 * Extracts word/*.xml text entries from a DOCX ZIP buffer using Node built-in zlib
 * by locating the End of Central Directory (EOCD) and iterating Central Directory headers.
 */
function extractDocxText(buffer) {
    if (!isZipBuffer(buffer)) {
        throw new AppError(400, "Invalid DOCX file format.")
    }

    // Find End of Central Directory signature (0x06054b50) from the tail
    let eocdOffset = -1
    const minOffset = Math.max(0, buffer.length - 65557)
    for (let i = buffer.length - 22; i >= minOffset; i--) {
        if (buffer.readUInt32LE(i) === 0x06054b50) {
            eocdOffset = i
            break
        }
    }
    if (eocdOffset === -1) {
        throw new AppError(400, "Corrupt DOCX archive (missing ZIP central directory).")
    }

    const totalEntries = buffer.readUInt16LE(eocdOffset + 10)
    const cdSize = buffer.readUInt32LE(eocdOffset + 12)
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16)

    if (totalEntries > MAX_DOCX_ENTRIES || cdOffset + cdSize > buffer.length) {
        throw new AppError(400, "Invalid or oversized DOCX archive structure.")
    }

    let cursor = cdOffset
    let foundDocumentXml = false
    const xmlSections = []
    let totalExtractedBytes = 0

    for (let i = 0; i < totalEntries; i++) {
        if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
            throw new AppError(400, "Corrupt DOCX central directory entry.")
        }

        const compressionMethod = buffer.readUInt16LE(cursor + 10)
        const compressedSize = buffer.readUInt32LE(cursor + 20)
        const uncompressedSize = buffer.readUInt32LE(cursor + 24)
        const fileNameLen = buffer.readUInt16LE(cursor + 28)
        const extraLen = buffer.readUInt16LE(cursor + 30)
        const commentLen = buffer.readUInt16LE(cursor + 32)
        const localHeaderOffset = buffer.readUInt32LE(cursor + 42)

        const fileName = buffer.subarray(cursor + 46, cursor + 46 + fileNameLen).toString("utf8")
        cursor += 46 + fileNameLen + extraLen + commentLen

        const isTargetXml =
            fileName === "word/document.xml" ||
            /^word\/(header|footer)\d*\.xml$/.test(fileName)

        if (!isTargetXml) {
            continue
        }

        if (fileName === "word/document.xml") {
            foundDocumentXml = true
        }

        if (
            uncompressedSize > MAX_DOCX_XML_BYTES ||
            totalExtractedBytes + uncompressedSize > MAX_DOCX_XML_BYTES
        ) {
            throw new AppError(400, "DOCX content exceeds safe decompression limit.")
        }

        if (localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
            throw new AppError(400, "Corrupt DOCX local file header.")
        }

        const lfhNameLen = buffer.readUInt16LE(localHeaderOffset + 26)
        const lfhExtraLen = buffer.readUInt16LE(localHeaderOffset + 28)
        const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen
        const dataEnd = dataStart + compressedSize

        if (dataEnd > buffer.length) {
            throw new AppError(400, "Truncated DOCX entry data.")
        }

        const compressedSlice = buffer.subarray(dataStart, dataEnd)
        let xmlBuffer
        if (compressionMethod === 0) {
            xmlBuffer = compressedSlice
        } else if (compressionMethod === 8) {
            try {
                xmlBuffer = zlib.inflateRawSync(compressedSlice, { maxOutputLength: MAX_DOCX_XML_BYTES })
            } catch {
                throw new AppError(400, "Corrupt or invalid DOCX archive data.")
            }
        } else {
            throw new AppError(400, "Unsupported DOCX compression method.")
        }

        if (totalExtractedBytes + xmlBuffer.length > MAX_DOCX_XML_BYTES) {
            throw new AppError(400, "DOCX content exceeds safe decompression limit.")
        }

        totalExtractedBytes += xmlBuffer.length
        const extracted = extractTextFromWordXml(xmlBuffer.toString("utf8"))
        if (extracted) {
            xmlSections.push({ fileName, text: extracted })
        }
    }

    if (!foundDocumentXml) {
        throw new AppError(400, "Uploaded file is not a valid DOCX document.")
    }

    // Prioritize main document body first, followed by headers/footers
    xmlSections.sort((a, b) => {
        if (a.fileName === "word/document.xml") return -1
        if (b.fileName === "word/document.xml") return 1
        return a.fileName.localeCompare(b.fileName)
    })

    return xmlSections.map((s) => s.text).join("\n\n").trim()
}

async function extractPdfText(buffer) {
    if (!isPdfBuffer(buffer)) {
        throw new AppError(400, "Invalid PDF file format.")
    }

    const parser = new pdfParse.PDFParse({ data: Uint8Array.from(buffer) })
    try {
        const result = await parser.getText()
        return (result?.text || "")
            .replace(/--\s*\d+\s*of\s*\d+\s*--/g, "")
            .trim()
    } catch (err) {
        throw new AppError(400, "Could not parse the uploaded PDF file. Please ensure it is not corrupted or password-protected.")
    } finally {
        if (typeof parser.destroy === "function") {
            await parser.destroy().catch(() => {})
        }
    }
}

async function extractResumeText(file) {
    if (!file || !file.buffer || file.buffer.length === 0) {
        throw new AppError(400, "Uploaded resume file is empty.")
    }

    const originalName = (file.originalname || "").toLowerCase()
    const mime = (file.mimetype || "").toLowerCase()

    const looksPdf = mime === "application/pdf" || originalName.endsWith(".pdf") || isPdfBuffer(file.buffer)
    const looksDocx =
        mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        originalName.endsWith(".docx")

    if (looksPdf && !originalName.endsWith(".docx")) {
        return extractPdfText(file.buffer)
    }
    if (looksDocx) {
        return extractDocxText(file.buffer)
    }

    throw new AppError(400, "Only PDF and DOCX resume files are supported.")
}

module.exports = {
    extractResumeText,
    extractPdfText,
    extractDocxText,
    isPdfBuffer,
    isZipBuffer,
}
