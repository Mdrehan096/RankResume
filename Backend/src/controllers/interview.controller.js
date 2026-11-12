const mongoose = require("mongoose")
const { generateInterviewReport, generateResumePdf } = require("../services/ai.service")
const interviewReportModel = require("../models/interviewReport.model")
const { extractResumeText } = require("../utils/resumeParser")

/**
 * @description Controller to generate interview report based on user self description, resume and job description.
 */
async function generateInterViewReportController(req, res, next) {
    try {
        const rawTitle = typeof req.body?.title === "string" ? req.body.title.trim() : ""
        const selfDescription = typeof req.body?.selfDescription === "string" ? req.body.selfDescription.trim() : ""
        const jobDescription = typeof req.body?.jobDescription === "string" ? req.body.jobDescription.trim() : ""

        if (!jobDescription) {
            return res.status(400).json({
                message: "Job description is required."
            })
        }

        if (jobDescription.length > 10000) {
            return res.status(400).json({
                message: "Job description is too long (maximum 10,000 characters)."
            })
        }

        if (!req.file && !selfDescription) {
            return res.status(400).json({
                message: "Either a resume file or a self-description is required."
            })
        }

        let resumeText = ""
        if (req.file) {
            resumeText = await extractResumeText(req.file)
        }

        if (!resumeText && !selfDescription) {
            return res.status(400).json({
                message: "Could not extract readable text from the uploaded resume. Please upload a text-based PDF/DOCX or enter a self-description."
            })
        }

        const interViewReportByAi = await generateInterviewReport({
            resume: resumeText,
            selfDescription,
            jobDescription
        })

        const interviewReport = await interviewReportModel.create({
            ...interViewReportByAi,
            title: rawTitle || interViewReportByAi.title || "Untitled Position",
            user: req.user.id,
            resume: resumeText,
            selfDescription,
            jobDescription,
        })

        return res.status(201).json({
            message: "Interview report generated successfully.",
            interviewReport
        })
    } catch (err) {
        return next(err)
    }
}

/**
 * @description Controller to get interview report by interviewId.
 */
async function getInterviewReportByIdController(req, res, next) {
    try {
        const { interviewId } = req.params

        if (!mongoose.Types.ObjectId.isValid(interviewId)) {
            return res.status(400).json({
                message: "Invalid interview report ID."
            })
        }

        const interviewReport = await interviewReportModel.findOne({ _id: interviewId, user: req.user.id })

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found."
            })
        }

        return res.status(200).json({
            message: "Interview report fetched successfully.",
            interviewReport
        })
    } catch (err) {
        return next(err)
    }
}

/**
 * @description Controller to get all interview reports of logged in user.
 */
async function getAllInterviewReportsController(req, res, next) {
    try {
        const interviewReports = await interviewReportModel
            .find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .select("-resume -selfDescription -jobDescription -__v -technicalQuestions -behavioralQuestions -skillGaps -preparationPlan")

        return res.status(200).json({
            message: "Interview reports fetched successfully.",
            interviewReports
        })
    } catch (err) {
        return next(err)
    }
}

/**
 * @description Controller to generate resume PDF based on user self description, resume and job description.
 */
async function generateResumePdfController(req, res, next) {
    try {
        const { interviewReportId } = req.params

        if (!mongoose.Types.ObjectId.isValid(interviewReportId)) {
            return res.status(400).json({
                message: "Invalid interview report ID."
            })
        }

        const interviewReport = await interviewReportModel.findOne({
            _id: interviewReportId,
            user: req.user.id
        })

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found."
            })
        }

        const { resume, jobDescription, selfDescription } = interviewReport

        const pdfBuffer = await generateResumePdf({ resume, jobDescription, selfDescription })

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="resume_${interviewReportId}.pdf"`
        })

        return res.send(pdfBuffer)
    } catch (err) {
        return next(err)
    }
}

module.exports = {
    generateInterViewReportController,
    getInterviewReportByIdController,
    getAllInterviewReportsController,
    generateResumePdfController
}
