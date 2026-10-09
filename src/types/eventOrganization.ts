export interface EventOrganizationContext {
  organizationId: string;
  organizationName: string;
  grantId: string;
  academicYear: string;
  expiresAt: string;
}
export interface ReplaceRepresentativeInput {
  organizationId: string;
  representativeId: string;
  academicYear: string;
  expiresAt: string;
  expectedGrantId: string | null;
}
export interface EventRepresentativeGrant {
  id: string;
  organizationId: string;
  representativeId: string;
  representativeName: string;
  academicYear: string;
  startsAt: string;
  expiresAt: string;
  grantedBy: string;
  endedAt: string | null;
  endedBy: string | null;
  endReason: string | null;
  profileActive: boolean;
  profileRole: string;
}
export interface EventOrganization {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  grants: EventRepresentativeGrant[];
}
export interface SaveEventOrganizationInput {
  id: string | null;
  code: string;
  name: string;
  isActive: boolean;
  expectedUpdatedAt: string | null;
}
