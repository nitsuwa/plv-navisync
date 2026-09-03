/**
 * useStudentAuth — re-exports from StudentAuthContext.
 *
 * All auth state is now provided by StudentAuthProvider (fetched once,
 * shared via React Context). This file exists for backward compatibility
 * so existing `import { useStudentAuth } from "../hooks/useStudentAuth"`
 * continue to work without changes.
 */
export { useStudentAuth } from "../contexts/StudentAuthContext";
export type { StudentAuthState } from "../contexts/StudentAuthContext";
