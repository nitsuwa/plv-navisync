export interface DemoOrgApplicantCredentials {
  email: string;
  password: string;
}

/** Return the optional applicant credentials only when demo login is usable. */
export function getDemoOrgApplicantCredentials(
  demoLoginEnabled: boolean,
  email: string,
  password: string,
): DemoOrgApplicantCredentials | null {
  const normalizedEmail = email.trim();
  if (!demoLoginEnabled || !normalizedEmail || !password) return null;
  return { email: normalizedEmail, password };
}
