import { useContext, useEffect, useCallback } from "react";
import { useParams } from "react-router";
import { InterviewContext } from "../interviewContext";
import {
    getAllInterviewReports,
    generateInterviewReport,
    getInterviewReportById,
    generateResumePdf,
} from "../services/interview.api";

export const useInterview = () => {
    const context = useContext(InterviewContext);
    const { interviewId } = useParams();

    if (!context) {
        throw new Error("useInterview must be used within an InterviewProvider");
    }

    const {
        loading,
        setLoading,
        generating,
        setGenerating,
        pdfLoading,
        setPdfLoading,
        error,
        setError,
        report,
        setReport,
        reports,
        setReports,
    } = context;

    const generateReport = useCallback(
        async ({ jobDescription, selfDescription, resumeFile }) => {
            setGenerating(true);
            setError("");
            try {
                const response = await generateInterviewReport({
                    jobDescription,
                    selfDescription,
                    resumeFile,
                });
                const created = response?.interviewReport ?? null;
                setReport(created);
                return { data: created, error: null };
            } catch (err) {
                const message = err?.message || "Failed to generate interview report.";
                setError(message);
                return { data: null, error: message };
            } finally {
                setGenerating(false);
            }
        },
        [setGenerating, setError, setReport]
    );

    const getReportById = useCallback(
        async (id) => {
            setLoading(true);
            setError("");
            try {
                const response = await getInterviewReportById(id);
                const fetched = response?.interviewReport ?? null;
                setReport(fetched);
                return { data: fetched, error: null };
            } catch (err) {
                const message = err?.message || "Interview report not found.";
                setReport(null);
                setError(message);
                return { data: null, error: message };
            } finally {
                setLoading(false);
            }
        },
        [setLoading, setError, setReport]
    );

    const getReports = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await getAllInterviewReports();
            const list = response?.interviewReports ?? [];
            setReports(list);
            return { data: list, error: null };
        } catch (err) {
            const message = err?.message || "Failed to load recent reports.";
            setError(message);
            return { data: [], error: message };
        } finally {
            setLoading(false);
        }
    }, [setLoading, setError, setReports]);

    const getResumePdf = useCallback(
        async (interviewReportId) => {
            setPdfLoading(true);
            setError("");
            let objectUrl = null;
            let link = null;
            try {
                const blobData = await generateResumePdf({ interviewReportId });
                objectUrl = window.URL.createObjectURL(
                    new Blob([blobData], { type: "application/pdf" })
                );
                link = document.createElement("a");
                link.href = objectUrl;
                link.setAttribute("download", `resume_${interviewReportId}.pdf`);
                document.body.appendChild(link);
                link.click();
                return { success: true, error: null };
            } catch (err) {
                const message = err?.message || "Failed to generate resume PDF.";
                setError(message);
                return { success: false, error: message };
            } finally {
                if (link && link.parentNode) {
                    link.parentNode.removeChild(link);
                }
                if (objectUrl) {
                    window.URL.revokeObjectURL(objectUrl);
                }
                setPdfLoading(false);
            }
        },
        [setPdfLoading, setError]
    );

    useEffect(() => {
        if (interviewId) {
            getReportById(interviewId);
        } else {
            getReports();
        }
    }, [interviewId, getReportById, getReports]);

    return {
        loading,
        generating,
        pdfLoading,
        error,
        report,
        reports,
        generateReport,
        getReportById,
        getReports,
        getResumePdf,
    };
};
