const LEETPUSH_VERSION = "0.1.0";

console.log("[LeetPush] Content script loaded on LeetCode.");
console.log(`[LeetPush] Version ${LEETPUSH_VERSION}`);

let waitingForSubmission = false;
let resultCheckTimer = null;
let resultCheckCount = 0;
let lastSubmitEventAt = 0;
let lastSubmittedCode = "";
let lastSubmittedLanguage = "";

let previousResultSnapshot = "";

const CHECK_INTERVAL_MS = 500;
const MAX_CHECKS = 60; // 30 seconds
const SUBMIT_DEBOUNCE_MS = 500;


/*
 * ---------------------------------------------------------
 * General helpers
 * ---------------------------------------------------------
 */

function isVisible(element) {
    if (!element) {
        return false;
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
    );
}

function getElementText(element) {
    return (element.innerText || element.textContent || "")
        .trim()
        .replace(/\s+/g, " ");
}

/*
 * ---------------------------------------------------------
 * Submission data extraction
 * ---------------------------------------------------------
 */

function extractProblemSlug() {
    const match = window.location.pathname.match(
        /\/problems\/([^/]+)/
    );

    return match ? match[1] : "";
}

function extractProblemUrl() {
    return window.location.href.split("?")[0];
}

function extractProblemTitle() {
    const pageTitle = document.title
        .replace(/\s*-\s*LeetCode\s*$/i, "")
        .trim();

    if (pageTitle) {
        return pageTitle;
    }

    return "";
}

function extractProblemNumber() {
    try {
        const nextDataElement =
            document.getElementById("__NEXT_DATA__");

        if (!nextDataElement) {
            return "";
        }

        const data = JSON.parse(
            nextDataElement.textContent || "{}"
        );

        const queries =
            data?.props?.pageProps?.dehydratedState?.queries;

        if (!Array.isArray(queries)) {
            return "";
        }

        for (const query of queries) {
            const question = query?.state?.data?.question;

            if (!question) {
                continue;
            }

            const currentSlug = extractProblemSlug();

            if (
                question.titleSlug === currentSlug &&
                question.questionFrontendId
            ) {
                return String(
                    question.questionFrontendId
                );
            }
        }
    } catch (error) {
        console.warn(
            "[LeetPush] ⚠️ Could not extract problem number:",
            error
        );
    }

    return "";
}

function extractLanguage() {
    const selectors = [
        'button[aria-label*="language" i]',
        'button[title*="language" i]',
        '[role="button"][aria-label*="language" i]',
        'button'
    ];

    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);

        for (const element of elements) {
            if (!isVisible(element)) {
                continue;
            }

            const text = getElementText(element);

            if (!text || text.length > 50) {
                continue;
            }

            const normalizedText = text.trim();

            if (
                /^Python3$/i.test(normalizedText) ||
                /^Python$/i.test(normalizedText) ||
                /^Java$/i.test(normalizedText) ||
                /^JavaScript$/i.test(normalizedText) ||
                /^TypeScript$/i.test(normalizedText) ||
                /^C\+\+$/.test(normalizedText) ||
                /^C#$/.test(normalizedText) ||
                /^Go$/i.test(normalizedText) ||
                /^Rust$/i.test(normalizedText) ||
                /^Kotlin$/i.test(normalizedText) ||
                /^Swift$/i.test(normalizedText)
            ) {
                return normalizedText;
            }
        }
    }

    return "";
}

function extractEditorCode() {
    /*
     * Monaco editor renders source code using .view-lines
     * and individual .view-line elements.
     *
     * Reading the individual lines preserves the actual
     * visible indentation better than reading one giant
     * textContent value.
     */

    const lineElements = document.querySelectorAll(
        ".view-lines .view-line"
    );

    if (lineElements.length > 0) {
        const lines = Array.from(lineElements).map(
            (element) => element.textContent ?? ""
        );

        return lines.join("\n");
    }

    /*
     * Fallback if Monaco's individual line elements are
     * temporarily unavailable.
     */
    const editor = document.querySelector(".view-lines");

    if (editor) {
        return editor.textContent ?? "";
    }

    return "";
}

function extractSubmissionData(status) {
    return {
        title: extractProblemTitle(),
        number: extractProblemNumber(),
        slug: extractProblemSlug(),
        url: extractProblemUrl(),
        language: lastSubmittedLanguage,
        code: lastSubmittedCode,
        status: status,
        submittedAt: new Date().toISOString()
    };
}

function logSubmissionData(data) {
    console.log("[LeetPush] ===============================");
    console.log("[LeetPush] 📦 SUBMISSION DATA");
    console.log("[LeetPush] ===============================");
    console.log(
        "[LeetPush] Problem:",
        data.number
            ? `${data.number}. ${data.title}`
            : data.title
    );
    console.log("[LeetPush] Slug:", data.slug);
    console.log("[LeetPush] URL:", data.url);
    console.log("[LeetPush] Language:", data.language);
    console.log("[LeetPush] Status:", data.status);
    console.log("[LeetPush] Code:");
    console.log(data.code);
    console.log("[LeetPush] ===============================");
}


/*
 * ---------------------------------------------------------
 * Submit button detection
 * ---------------------------------------------------------
 */

function isSubmitElement(element) {
    if (!element || !(element instanceof Element)) {
        return false;
    }

    if (!isVisible(element)) {
        return false;
    }

    const text = getElementText(element);

    const ariaLabel = (
        element.getAttribute("aria-label") || ""
    ).trim();

    const title = (
        element.getAttribute("title") || ""
    ).trim();

    /*
     * LeetCode can place the actual click target on a
     * button, span, div, or another nested element.
     *
     * Do NOT require a specific tag or role.
     */

    const looksLikeSubmitText =
        /^Submit\b/i.test(text);

    const looksLikeSubmitAria =
        /\bSubmit\b/i.test(ariaLabel);

    const looksLikeSubmitTitle =
        /\bSubmit\b/i.test(title);

    return (
        looksLikeSubmitText ||
        looksLikeSubmitAria ||
        looksLikeSubmitTitle
    );
}

function findSubmitElementFromEvent(event) {
    if (!event) {
        return null;
    }

    /*
     * composedPath() is useful because LeetCode's UI is
     * dynamically rendered and can contain nested elements.
     */
    if (typeof event.composedPath === "function") {
        const path = event.composedPath();

        for (const element of path) {
            if (element instanceof Element && isSubmitElement(element)) {
                return element;
            }
        }
    }

    /*
     * Fallback: walk upward from the event target.
     */
    let element = event.target;

    while (element) {
        if (element instanceof Element && isSubmitElement(element)) {
            return element;
        }

        element = element.parentElement;
    }

    return null;
}


/*
 * ---------------------------------------------------------
 * Submission result detection
 * ---------------------------------------------------------
 *
 * IMPORTANT:
 *
 * We do NOT simply search the entire page for "Accepted".
 *
 * LeetCode can already have an old Accepted result visible.
 * Instead, we take a snapshot of the current result area
 * before Submit and wait for that area to change.
 */

function findSubmissionResultContainer() {
    const candidates = [];

    const elements = document.querySelectorAll(
        "div, section, main, article"
    );

    for (const element of elements) {
        if (!isVisible(element)) {
            continue;
        }

        const text = getElementText(element);

        if (!text || text.length > 5000) {
            continue;
        }

        const hasAccepted =
            /\bAccepted\b/i.test(text);

        const hasWrongAnswer =
            /\bWrong Answer\b/i.test(text);

        const hasRuntimeError =
            /\bRuntime Error\b/i.test(text);

        const hasTimeLimit =
            /\bTime Limit Exceeded\b/i.test(text);

        const hasCompileError =
            /\bCompile Error\b/i.test(text);

        const hasMemoryLimit =
            /\bMemory Limit Exceeded\b/i.test(text);

        /*
         * Accepted / performance results:
         * LeetCode's accepted result panel contains both
         * Runtime and Memory.
         */
        const hasRuntime =
            /\bRuntime\b/i.test(text);

        const hasMemory =
            /\bMemory\b/i.test(text);

        const acceptedResult =
            hasAccepted &&
            hasRuntime &&
            hasMemory;

        /*
         * Wrong Answer result:
         * The result panel contains the terminal status
         * plus test-result information such as Input,
         * Output, or Expected.
         */
        const hasInput =
            /\bInput\b/i.test(text) ||
            /\bLast Executed Input\b/i.test(text);

        const hasOutput =
            /\bOutput\b/i.test(text);

        const hasExpected =
            /\bExpected\b/i.test(text);

        const wrongAnswerResult =
            hasWrongAnswer &&
            hasInput &&
            (hasOutput || hasExpected);

        /*
         * Runtime Error result:
         * Require execution/error information in addition
         * to the Runtime Error label.
         */
        const hasErrorDetails =
            /\bNameError\b/i.test(text) ||
            /\bTypeError\b/i.test(text) ||
            /\bValueError\b/i.test(text) ||
            /\bIndexError\b/i.test(text) ||
            /\bKeyError\b/i.test(text) ||
            /\bTraceback\b/i.test(text) ||
            /\bLast Executed Input\b/i.test(text) ||
            /\bLine \d+\b/i.test(text);

        const runtimeErrorResult =
            hasRuntimeError &&
            hasErrorDetails;

        /*
         * Other terminal results.
         */
        const otherResult =
            (hasTimeLimit ||
                hasCompileError ||
                hasMemoryLimit) &&
            (
                hasInput ||
                hasRuntime ||
                hasMemory ||
                hasErrorDetails
            );

        if (
            !acceptedResult &&
            !wrongAnswerResult &&
            !runtimeErrorResult &&
            !otherResult
        ) {
            continue;
        }

        /*
         * Score candidates so the actual result panel is
         * preferred over larger parent containers.
         */
        let score = 0;

        if (acceptedResult) {
            score += 100;
        }

        if (wrongAnswerResult) {
            score += 100;
        }

        if (runtimeErrorResult) {
            score += 100;
        }

        if (otherResult) {
            score += 100;
        }

        if (hasInput) {
            score += 20;
        }

        if (hasOutput) {
            score += 20;
        }

        if (hasExpected) {
            score += 20;
        }

        if (hasRuntime) {
            score += 10;
        }

        if (hasMemory) {
            score += 10;
        }

        candidates.push({
            element,
            score,
            length: text.length
        });
    }

    /*
     * Prefer the most result-specific candidate.
     * If scores tie, prefer the smaller container.
     */
    candidates.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }

        return a.length - b.length;
    });

    return candidates.length > 0
        ? candidates[0].element
        : null;
}

function getSubmissionResultSnapshot() {
    const container = findSubmissionResultContainer();

    if (!container) {
        return "";
    }

    return getElementText(container);
}

function detectSubmissionStatus(snapshot) {
    if (!snapshot) {
        return null;
    }

    if (/\bWrong Answer\b/i.test(snapshot)) {
        return "Wrong Answer";
    }

    if (/\bTime Limit Exceeded\b/i.test(snapshot)) {
        return "Time Limit Exceeded";
    }

    if (/\bRuntime Error\b/i.test(snapshot)) {
        return "Runtime Error";
    }

    if (/\bCompile Error\b/i.test(snapshot)) {
        return "Compile Error";
    }

    if (/\bMemory Limit Exceeded\b/i.test(snapshot)) {
        return "Memory Limit Exceeded";
    }

    if (/\bAccepted\b/i.test(snapshot)) {
        return "Accepted";
    }

    return null;
}

function stopResultChecking() {
    if (resultCheckTimer !== null) {
        clearTimeout(resultCheckTimer);
        resultCheckTimer = null;
    }
}

function checkSubmissionResult() {
    if (!waitingForSubmission) {
        return;
    }

    const snapshot = getSubmissionResultSnapshot();

    if (!snapshot) {
        scheduleNextResultCheck();
        return;
    }

    /*
     * Ignore the result that was already visible BEFORE this
     * submission. We only react when the result area changes.
     */
    if (snapshot === previousResultSnapshot) {
        scheduleNextResultCheck();
        return;
    }

    const status = detectSubmissionStatus(snapshot);

    if (!status) {
        previousResultSnapshot = snapshot;
        scheduleNextResultCheck();
        return;
    }

    console.log(
        "[LeetPush] 🔎 New submission result detected:",
        status
    );

    handleDetectedSubmissionStatus(status);
}

function scheduleNextResultCheck() {
    if (!waitingForSubmission) {
        return;
    }

    resultCheckCount += 1;

    if (resultCheckCount >= MAX_CHECKS) {
        waitingForSubmission = false;
        stopResultChecking();

        console.log(
            "[LeetPush] ⏱️ Submission result check timed out."
        );

        return;
    }

    resultCheckTimer = setTimeout(() => {
        resultCheckTimer = null;
        checkSubmissionResult();
    }, CHECK_INTERVAL_MS);
}

function handleDetectedSubmissionStatus(status) {
    if (!waitingForSubmission) {
        return;
    }

    waitingForSubmission = false;

    stopResultChecking();

    if (status === "Accepted") {
        console.log(
            "[LeetPush] ✅ Accepted submission detected!"
        );

        const submissionData = extractSubmissionData(
            "Accepted"
        );

        logSubmissionData(submissionData);

        chrome.runtime.sendMessage(
            {
                type: "LEETPUSH_ACCEPTED_SUBMISSION",
                submission: submissionData
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "[LeetPush] ❌ Could not contact background service:",
                        chrome.runtime.lastError.message
                    );
                    return;
                }

                if (!response?.ok) {
                    console.error(
                        "[LeetPush] ❌ Native sync failed:",
                        response?.error || "Unknown error."
                    );
                    return;
                }

                if (response.response?.ok === false) {
                    console.error(
                        "[LeetPush] ❌ Native host failed:",
                        response.response.error || "Unknown native host error."
                    );
                    return;
                }

                console.log(
                    "[LeetPush] ✅ Solution synced successfully:",
                    response.response
                );
            }
        );

        return;
    }

    if (status === "Wrong Answer") {
        console.log(
            "[LeetPush] ❌ Wrong Answer detected."
        );

        const submissionData = extractSubmissionData(
            "Wrong Answer"
        );

        logSubmissionData(submissionData);

        return;
    }

    console.log(
        `[LeetPush] ℹ️ Submission result detected: ${status}`
    );
}

function startResultObserver() {
    if (window.__leetPushObserver) {
        window.__leetPushObserver.disconnect();
    }

    const observer = new MutationObserver(
        handleSubmissionMutation
    );

    observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true
    });

    window.__leetPushObserver = observer;
}

function stopResultObserver() {
    if (window.__leetPushObserver) {
        window.__leetPushObserver.disconnect();
        window.__leetPushObserver = null;
    }
}


/*
 * ---------------------------------------------------------
 * Start a NEW detection cycle for every Submit
 * ---------------------------------------------------------
 */

function startSubmissionDetection() {
    /*
     * Every Submit starts a completely new detection cycle.
     */
    stopResultChecking();

    /*
     * IMPORTANT:
     * Capture what the result area looked like BEFORE this
     * submission. This prevents an old "Accepted" result from
     * being mistaken for the new submission.
     */
    previousResultSnapshot = getSubmissionResultSnapshot();

    resultCheckCount = 0;
    waitingForSubmission = true;

    /*
     * Capture the code being submitted NOW.
     */
    lastSubmittedCode = extractEditorCode();
    lastSubmittedLanguage = extractLanguage();

    console.log(
        "[LeetPush] 📝 Captured submitted language:",
        lastSubmittedLanguage
    );

    if (!lastSubmittedCode.trim()) {
        console.warn(
            "[LeetPush] ⚠️ Could not extract editor code at Submit time."
        );
    }

    console.log(
        "[LeetPush] 📝 Captured submitted code:",
        lastSubmittedCode.length,
        "characters"
    );

    console.log(
        "[LeetPush] 🖱️ Submit detected. Waiting for submission result..."
    );

    /*
     * Start polling the actual result area.
     */
    checkSubmissionResult();
}

function handleSubmitInteraction(event) {
    const submitElement = findSubmitElementFromEvent(event);

    if (!submitElement) {
        return;
    }

    const now = Date.now();

    /*
     * A physical click can produce both pointerdown and click.
     * Treat them as one Submit action.
     */
    if (now - lastSubmitEventAt < SUBMIT_DEBOUNCE_MS) {
        return;
    }

    lastSubmitEventAt = now;

    console.log("[LeetPush] 🖱️ Submit control pressed.");

    startSubmissionDetection();
}


/*
 * ---------------------------------------------------------
 * Event listeners
 * ---------------------------------------------------------
 */

document.addEventListener(
    "pointerdown",
    handleSubmitInteraction,
    true
);

document.addEventListener(
    "click",
    handleSubmitInteraction,
    true
);

console.log(
    "[LeetPush] Ready. Waiting for a submission."
);
