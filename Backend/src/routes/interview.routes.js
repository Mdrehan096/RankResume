const express = require("express")
const authMiddleware = require("../middlewares/auth.middleware")
const interviewController = require("../controllers/interview.controller")
const upload = require("../middlewares/file.middleware")
const { createRateLimiter } = require("../middlewares/security.middleware")

const interviewRouter = express.Router()

const aiRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    keyGenerator: (req) => req.user?.id || req.ip,
    message: "AI generation limit reached. Please wait a few minutes before generating another report or PDF."
})

/**
 * @route POST /api/interview/
 * @description generate new interview report on the basis of user self description, resume (PDF/DOCX) and job description.
 * @access private
 */
interviewRouter.post("/", authMiddleware.authUser, aiRateLimiter, upload.single("resume"), interviewController.generateInterViewReportController)

/**
 * @route GET /api/interview/report/:interviewId
 * @description get interview report by interviewId.
 * @access private
 */
interviewRouter.get("/report/:interviewId", authMiddleware.authUser, interviewController.getInterviewReportByIdController)

/**
 * @route GET /api/interview/
 * @description get all interview reports of logged in user.
 * @access private
 */
interviewRouter.get("/", authMiddleware.authUser, interviewController.getAllInterviewReportsController)

/**
 * @route POST /api/interview/resume/pdf/:interviewReportId
 * @description generate resume pdf on the basis of user self description, resume content and job description.
 * @access private
 */
interviewRouter.post("/resume/pdf/:interviewReportId", authMiddleware.authUser, aiRateLimiter, interviewController.generateResumePdfController)

module.exports = interviewRouter
