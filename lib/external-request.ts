export const EXTERNAL_REQUEST_TIMEOUT_MS = 8_000;

export function externalRequestSignal() {
  return AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS);
}

export async function withExternalRequestDeadline<T>(
  operation: Promise<T>,
  timeoutMs = EXTERNAL_REQUEST_TIMEOUT_MS,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("EXTERNAL_REQUEST_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
