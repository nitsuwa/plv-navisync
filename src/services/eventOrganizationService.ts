import { getSupabase } from '../lib/supabase';
import type { EventOrganizationContext, EventOrganization, EventRepresentativeGrant, ReplaceRepresentativeInput, SaveEventOrganizationInput } from '../types/eventOrganization';

export class OrganizationAccessUnavailable extends Error {
  constructor() { super('Organization access is not configured yet. Ask an administrator to apply the organization database update.'); this.name='OrganizationAccessUnavailable'; }
}
export class OrganizationAssignmentChanged extends Error {
  constructor() { super('This assignment changed. Refresh and review the current representative before trying again.'); this.name='OrganizationAssignmentChanged'; }
}
function record(value: unknown): Record<string,unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Invalid organization response. Please refresh.');
  return value as Record<string,unknown>;
}
function required(row: Record<string,unknown>,key:string): string {
  const value=row[key];
  if(typeof value!=='string' || !value.trim()) throw new Error('Incomplete organization response. Please refresh.');
  return value;
}
function instant(row: Record<string,unknown>,key:string): string {
  const value=required(row,key);
  if(!Number.isFinite(Date.parse(value))) throw new Error('Invalid organization timestamp. Please refresh.');
  return value;
}
function unwrap(result:{data:unknown;error:unknown}): unknown {
  if(result.error){
    const error=record(result.error); const code=error.code;
    if(['PGRST202','PGRST205','42883','42P01'].includes(String(code))) throw new OrganizationAccessUnavailable();
    if(code==='40001') throw new OrganizationAssignmentChanged();
    if(code==='42501') throw new Error('Your organization access changed or this action requires administrator permission.');
    if(code==='23505') throw new Error('This organization code already exists. Choose a different code.');
    throw new Error(typeof error.message==='string'?error.message:'Organization access could not be loaded. Reconnect and retry.');
  }
  return result.data;
}
function context(value:unknown): EventOrganizationContext {
  const row=record(value);
  return {organizationId:required(row,'organization_id'),organizationName:required(row,'organization_name'),grantId:required(row,'grant_id'),academicYear:required(row,'academic_year'),expiresAt:instant(row,'expires_at')};
}
function grant(value:unknown): EventRepresentativeGrant {
  const row=record(value);
  return {id:required(row,'id'),organizationId:required(row,'organization_id'),representativeId:required(row,'representative_id'),representativeName:typeof row.representative_name==='string'?row.representative_name:'Representative',academicYear:required(row,'academic_year'),startsAt:instant(row,'starts_at'),expiresAt:instant(row,'expires_at'),grantedBy:required(row,'granted_by'),endedAt:typeof row.ended_at==='string'?row.ended_at:null,endedBy:typeof row.ended_by==='string'?row.ended_by:null,endReason:typeof row.end_reason==='string'?row.end_reason:null,profileActive:row.profile_active===true,profileRole:typeof row.profile_role==='string'?row.profile_role:''};
}
function organization(value:unknown): EventOrganization {
  const row=record(value);
  if(typeof row.is_active!=='boolean') throw new Error('Invalid organization status. Please refresh.');
  return {id:required(row,'id'),code:required(row,'code'),name:required(row,'name'),isActive:row.is_active,createdAt:instant(row,'created_at'),updatedAt:instant(row,'updated_at'),grants:Array.isArray(row.grants)?row.grants.map(grant):[]};
}
async function listMyEventOrganizations():Promise<EventOrganizationContext[]> {
  const data=unwrap(await getSupabase().rpc('get_my_event_organizations'));
  if(!Array.isArray(data)) throw new Error('Invalid organization response. Please retry.');
  return data.map(context);
}
async function replaceRepresentative(input:ReplaceRepresentativeInput):Promise<EventOrganizationContext> {
  return context(unwrap(await getSupabase().rpc('admin_set_event_representative',{p_organization_id:input.organizationId,p_profile_id:input.representativeId,p_academic_year:input.academicYear,p_expires_at:input.expiresAt,p_expected_grant_id:input.expectedGrantId})));
}
async function revokeRepresentative(organizationId:string,expectedGrantId:string,reason:string):Promise<void> {
  unwrap(await getSupabase().rpc('admin_revoke_event_representative',{p_organization_id:organizationId,p_expected_grant_id:expectedGrantId,p_reason:reason}));
}
async function listOrganizations():Promise<EventOrganization[]> {
  const data=unwrap(await getSupabase().rpc('admin_list_event_organizations'));
  if(!Array.isArray(data)) throw new Error('Invalid organization response. Please retry.');
  return data.map(organization);
}
async function saveOrganization(input:SaveEventOrganizationInput):Promise<EventOrganization> {
  return organization(unwrap(await getSupabase().rpc('admin_save_event_organization',{p_id:input.id,p_code:input.code,p_name:input.name,p_is_active:input.isActive,p_expected_updated_at:input.expectedUpdatedAt})));
}
export const eventOrganizationService={listMyEventOrganizations,replaceRepresentative,revokeRepresentative,listOrganizations,saveOrganization};
