import { describe, expect, it } from "vitest";
import { getDemoOrgApplicantCredentials } from "../demoAccountConfig";

describe("getDemoOrgApplicantCredentials", () => {
  it("accepts the local Demo Student Org credentials", () => {
    expect(getDemoOrgApplicantCredentials(
      true,
      "DEMOSTUDENTORG@plv.edu.ph",
      "DEMOSTUDENTORG",
    )).toEqual({
      email: "DEMOSTUDENTORG@plv.edu.ph",
      password: "DEMOSTUDENTORG",
    });
  });

  it("returns the optional regular-student applicant credentials when configured", () => {
    expect(getDemoOrgApplicantCredentials(true, "org-applicant@plv.edu.ph", "test123"))
      .toEqual({ email: "org-applicant@plv.edu.ph", password: "test123" });
  });

  it("does not expose an applicant option when demo mode or credentials are missing", () => {
    expect(getDemoOrgApplicantCredentials(false, "org-applicant@plv.edu.ph", "test123")).toBeNull();
    expect(getDemoOrgApplicantCredentials(true, "", "test123")).toBeNull();
    expect(getDemoOrgApplicantCredentials(true, "org-applicant@plv.edu.ph", "")).toBeNull();
  });
});
