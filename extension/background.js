console.log("[LeetPush] Background service worker started.");

chrome.runtime.onInstalled.addListener(() => {
  console.log("[LeetPush] Extension installed.");
});
