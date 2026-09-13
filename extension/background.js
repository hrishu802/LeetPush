console.log("[LeetPush] Background service worker started.");

chrome.runtime.onInstalled.addListener(() => {
    console.log("[LeetPush] Extension installed.");
});

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
        if (message?.type === "LEETPUSH_NATIVE_TEST") {
            console.log(
                "[LeetPush] Sending test message to native host..."
            );

            chrome.runtime.sendNativeMessage(
                "com.leetpush.host",
                {
                    test: "hello"
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            "[LeetPush] ❌ Native host error:",
                            chrome.runtime.lastError.message
                        );

                        sendResponse({
                            ok: false,
                            error: chrome.runtime.lastError.message
                        });

                        return;
                    }

                    console.log(
                        "[LeetPush] ✅ Native host response:",
                        response
                    );

                    sendResponse({
                        ok: true,
                        response
                    });
                }
            );

            return true;
        }

        if (message?.type === "LEETPUSH_ACCEPTED_SUBMISSION") {
            console.log(
                "[LeetPush] 📤 Sending accepted submission to native host:",
                message.submission
            );

            chrome.runtime.sendNativeMessage(
                "com.leetpush.host",
                {
                    type: "accepted_submission",
                    submission: message.submission
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            "[LeetPush] ❌ Native host error:",
                            chrome.runtime.lastError.message
                        );

                        sendResponse({
                            ok: false,
                            error: chrome.runtime.lastError.message
                        });

                        return;
                    }

                    console.log(
                        "[LeetPush] ✅ Native host response:",
                        response
                    );

                    sendResponse({
                        ok: true,
                        response
                    });
                }
            );

            return true;
        }
    }
);
