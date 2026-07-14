/**
 * Environment variable validator.
 * Throws a descriptive error if a required variable is missing,
 * making misconfiguration obvious early.
 */
export function requireEnv(key: string): string {
  const value = import.meta.env[key] as string | undefined;
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
      `Add it to your .env file:\n${key}=your_value`
    );
  }
  return value;
}

export function optionalEnv(key: string, fallback: string): string {
  return (import.meta.env[key] as string | undefined) ?? fallback;
}
