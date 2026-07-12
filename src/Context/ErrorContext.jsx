import { createContext, useContext, useState, useCallback, useRef } from "react";

const ErrorContext = createContext();
const ErrorProvider = ({ children }) => {
    const [errorMessage, setErrorMessage] = useState("");
    const [error, setError] = useState(false);
    const [errorAnimation, setErrorAnimation] = useState(false);

    const [loaderMessage, setLoaderMessage] = useState("");
    const [loaderState, setLoaderState] = useState(false);

    // A single shared timer so a new error resets the countdown instead of
    // stacking timeouts that could hide a later message early.
    const dismissTimerRef = useRef(null);

    const clearError = useCallback(() => {
        setErrorAnimation(false);
        setTimeout(() => setError(false), 500);
    }, []);

    const showError = useCallback(
        (text, duration = 3000) => {
            setErrorMessage(text);
            setError(true);
            setErrorAnimation(true);

            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = setTimeout(clearError, duration);
        },
        [clearError],
    );

    const data = {
        loaderState,
        loaderMessage,
        setLoaderMessage,
        setLoaderState,
        errorMessage,
        setErrorMessage,
        error,
        clearError,
        showError,
        errorAnimation,
    };
    return (
        <ErrorContext.Provider value={data}>{children}</ErrorContext.Provider>
    );
};

export const useError = () => {
    const context = useContext(ErrorContext);
    if (!context) {
        throw new Error("useContext must be used within a ErrorProvider");
    }
    return context;
};
export { ErrorProvider };
export default ErrorContext;
