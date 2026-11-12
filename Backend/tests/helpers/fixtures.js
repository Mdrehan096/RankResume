const zlib = require("zlib")

function escapePdfString(str) {
    return String(str).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

function createValidPdfBuffer(text = "Jane Doe Senior Full Stack Engineer React Node MongoDB") {
    const contentStream = `BT /F1 12 Tf 72 720 Td (${escapePdfString(text)}) Tj ET\n`
    const objects = [
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
        `4 0 obj\n<< /Length ${Buffer.byteLength(contentStream, "ascii")} >>\nstream\n${contentStream}endstream\nendobj\n`,
        "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ]

    let pdf = "%PDF-1.4\n"
    const offsets = [0]
    for (const obj of objects) {
        offsets.push(Buffer.byteLength(pdf, "ascii"))
        pdf += obj
    }

    const xrefStart = Buffer.byteLength(pdf, "ascii")
    pdf += `xref\n0 ${objects.length + 1}\n`
    pdf += "0000000000 65535 f \n"
    for (let i = 1; i < offsets.length; i++) {
        pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

    return Buffer.from(pdf, "ascii")
}

// Standard CRC-32 table for valid ZIP headers
const CRC_TABLE = (() => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        }
        table[n] = c >>> 0
    }
    return table
})()

function crc32(buf) {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    }
    return (c ^ 0xffffffff) >>> 0
}

function createZipBuffer(entries) {
    const localParts = []
    const centralParts = []
    let offset = 0

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, "utf8")
        const rawBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8")
        const method = entry.method === 0 ? 0 : 8
        const compBuf = entry.corruptDeflate
            ? Buffer.from([0xde, 0xad, 0xbe, 0xef])
            : method === 0
                ? rawBuf
                : zlib.deflateRawSync(rawBuf)
        const checksum = crc32(rawBuf)
        const declaredUncompressedSize =
            typeof entry.declaredUncompressedSize === "number"
                ? entry.declaredUncompressedSize
                : rawBuf.length

        const lfh = Buffer.alloc(30 + nameBuf.length)
        lfh.writeUInt32LE(0x04034b50, 0)
        lfh.writeUInt16LE(20, 4)
        lfh.writeUInt16LE(0, 6)
        lfh.writeUInt16LE(method, 8)
        lfh.writeUInt16LE(0, 10)
        lfh.writeUInt16LE(0, 12)
        lfh.writeUInt32LE(checksum, 14)
        lfh.writeUInt32LE(compBuf.length, 18)
        lfh.writeUInt32LE(declaredUncompressedSize, 22)
        lfh.writeUInt16LE(nameBuf.length, 26)
        lfh.writeUInt16LE(0, 28)
        nameBuf.copy(lfh, 30)

        localParts.push(lfh, compBuf)

        const cdh = Buffer.alloc(46 + nameBuf.length)
        cdh.writeUInt32LE(0x02014b50, 0)
        cdh.writeUInt16LE(20, 4)
        cdh.writeUInt16LE(20, 6)
        cdh.writeUInt16LE(0, 8)
        cdh.writeUInt16LE(method, 10)
        cdh.writeUInt16LE(0, 12)
        cdh.writeUInt16LE(0, 14)
        cdh.writeUInt32LE(checksum, 16)
        cdh.writeUInt32LE(compBuf.length, 20)
        cdh.writeUInt32LE(declaredUncompressedSize, 24)
        cdh.writeUInt16LE(nameBuf.length, 28)
        cdh.writeUInt16LE(0, 30)
        cdh.writeUInt16LE(0, 32)
        cdh.writeUInt16LE(0, 34)
        cdh.writeUInt16LE(0, 36)
        cdh.writeUInt32LE(0, 38)
        cdh.writeUInt32LE(offset, 42)
        nameBuf.copy(cdh, 46)

        centralParts.push(cdh)
        offset += lfh.length + compBuf.length
    }

    const centralDir = Buffer.concat(centralParts)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(0, 4)
    eocd.writeUInt16LE(0, 6)
    eocd.writeUInt16LE(entries.length, 8)
    eocd.writeUInt16LE(entries.length, 10)
    eocd.writeUInt32LE(centralDir.length, 12)
    eocd.writeUInt32LE(offset, 16)
    eocd.writeUInt16LE(0, 20)

    return Buffer.concat([...localParts, centralDir, eocd])
}

function escapeXml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
}

function createValidDocxBuffer(paragraphs = ["Jane Doe - Senior Engineer", "Skills: React, Node.js, PostgreSQL"]) {
    const bodyXml = paragraphs
        .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
        .join("")
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`

    return createZipBuffer([
        {
            name: "[Content_Types].xml",
            data: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
        },
        {
            name: "word/document.xml",
            data: docXml,
        },
    ])
}

module.exports = {
    createValidPdfBuffer,
    createZipBuffer,
    createValidDocxBuffer,
    escapeXml,
}

