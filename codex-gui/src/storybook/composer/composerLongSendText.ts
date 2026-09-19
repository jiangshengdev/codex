export const composerLongSendText = [
  "Review this fictional long message, including the implementation, its assumptions, and the interaction between draft recovery and message delivery. Explain which observations confirm delivery and which still leave the result unresolved. Keep the original message available while reviewing the evidence.",
  "Check the narrow-screen layout with several paragraphs of retained content. The explanation, message body, and removal action should remain clearly separated. Removing this local record must leave other records and the current draft intact, and it must not automatically resend any message.",
  `Fictional reference: ${"review-context-".repeat(24)}end-of-reference`,
  "End of the fictional long message. Summarize remaining questions before deciding whether to remove the local record.",
].join("\n\n");
