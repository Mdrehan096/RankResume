import { useState, useContext, useCallback } from "react";
import { InterviewContext } from "./interviewContext";
import { AuthContext } from "../auth/authContext";

export const InterviewProvider = ({ children }) => {
    const auth = useContext(AuthContext);
    const userId = auth?.user?._id ?? auth?.user?.id ?? null;

    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [errorState, setErrorState] = useState({ ownerId: userId, value: "" });
    const [reportState, setReportState] = useState({ ownerId: userId, value: null });
    const [reportsState, setReportsState] = useState({ ownerId: userId, value: [] });

    const error = errorState.ownerId === userId ? errorState.value : "";
    const report = reportState.ownerId === userId ? reportState.value : null;
    const reports = reportsState.ownerId === userId ? reportsState.value : [];

    const setError = useCallback(
        (value) => {
            setErrorState((prev) => {
                const current = prev.ownerId === userId ? prev.value : "";
                return {
                    ownerId: userId,
                    value: typeof value === "function" ? value(current) : value,
                };
            });
        },
        [userId]
    );

    const setReport = useCallback(
        (value) => {
            setReportState((prev) => {
                const current = prev.ownerId === userId ? prev.value : null;
                return {
                    ownerId: userId,
                    value: typeof value === "function" ? value(current) : value,
                };
            });
        },
        [userId]
    );

    const setReports = useCallback(
        (value) => {
            setReportsState((prev) => {
                const current = prev.ownerId === userId ? prev.value : [];
                return {
                    ownerId: userId,
                    value: typeof value === "function" ? value(current) : value,
                };
            });
        },
        [userId]
    );

    return (
        <InterviewContext.Provider
            value={{
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
            }}
        >
            {children}
        </InterviewContext.Provider>
    );
};
