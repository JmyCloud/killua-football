// lib/logger.js
// Lightweight structured logger for Vercel serverless (writes JSON to stdout/stderr)

function formatEntry(level, message, context = {}) {
  return JSON.stringify({
    level,
    message,
    ...context,
    ts: new Date().toISOString(),
  });
}

export const logger = {
  info(message, context) {
    console.log(formatEntry("info", message, context));
  },

  warn(message, context) {
    console.warn(formatEntry("warn", message, context));
  },

  error(message, context) {
    console.error(formatEntry("error", message, context));
  },

  /** Log an error with its stack trace extracted */
  exception(message, err, context = {}) {
    console.error(
      formatEntry("error", message, {
        ...context,
        error: err?.message ?? String(err),
        stack: err?.stack?.split("\n").slice(0, 5).join("\n") ?? null,
      })
    );
  },
};
