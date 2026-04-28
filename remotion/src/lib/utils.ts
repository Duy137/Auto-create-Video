// remotion/src/lib/utils.ts

/**
 * Recursively converts all object keys from snake_case to camelCase.
 *
 * Used to transform Python's snake_case JSON output (from Pydantic model_dump)
 * into TypeScript's camelCase before Zod validation.
 *
 * Examples:
 *   "job_id" → "jobId"
 *   "start_ms" → "startMs"
 *   "keywords_to_highlight" → "keywordsToHighlight"
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}

export function camelizeKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => camelizeKeys(item));
  }
  if (obj !== null && typeof obj === "object" && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[snakeToCamel(key)] = camelizeKeys(value);
    }
    return result;
  }
  return obj;
}
