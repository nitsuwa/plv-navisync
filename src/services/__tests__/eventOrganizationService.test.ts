import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabase } from '../../lib/supabase';
import { eventOrganizationService, OrganizationAccessUnavailable, OrganizationAssignmentChanged, OrganizationRecordChanged } from '../eventOrganizationService';
vi.mock('../../lib/supabase', () => ({getSupabase:vi.fn()}));
let rpc: ReturnType<typeof vi.fn>;
beforeEach(()=>{rpc=vi.fn().mockResolvedValue({data:[],error:null});vi.mocked(getSupabase).mockReturnValue({rpc} as never);});
describe('verified organization access service',()=>{
  it('returns only validated server organization contexts',async()=>{
    rpc.mockResolvedValue({data:[{organization_id:'org-a',organization_name:'IT',grant_id:'grant-a',academic_year:'2026–2027',expires_at:'2027-06-01T00:00:00Z'}],error:null});
    expect(await eventOrganizationService.listMyEventOrganizations()).toEqual([{organizationId:'org-a',organizationName:'IT',grantId:'grant-a',academicYear:'2026–2027',expiresAt:'2027-06-01T00:00:00Z'}]);
  });
  it('does not turn unavailable migration into an empty membership result',async()=>{
    rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'Could not find function'}});
    await expect(eventOrganizationService.listMyEventOrganizations()).rejects.toBeInstanceOf(OrganizationAccessUnavailable);
  });
  it('rejects a stale admin assignment without retrying the replacement',async()=>{
    rpc.mockResolvedValue({data:null,error:{code:'40001',message:'Assignment changed'}});
    await expect(eventOrganizationService.replaceRepresentative({organizationId:'org-a',representativeId:'new',academicYear:'2026–2027',expiresAt:'2027-06-01T00:00:00Z',expectedGrantId:'old'})).rejects.toBeInstanceOf(OrganizationAssignmentChanged);
    expect(rpc).toHaveBeenCalledOnce();
  });
  it('includes the expected grant in the handover request',async()=>{
    rpc.mockResolvedValue({data:{organization_id:'org-a',organization_name:'IT',grant_id:'grant-b',academic_year:'2026–2027',expires_at:'2027-06-01T00:00:00Z'},error:null});
    const result=await eventOrganizationService.replaceRepresentative({organizationId:'org-a',representativeId:'new',academicYear:'2026–2027',expiresAt:'2027-06-01T00:00:00Z',expectedGrantId:'old'});
    expect(result.grantId).toBe('grant-b');
    expect(rpc).toHaveBeenCalledWith('admin_set_event_representative',{p_organization_id:'org-a',p_profile_id:'new',p_academic_year:'2026–2027',p_expires_at:'2027-06-01T00:00:00Z',p_expected_grant_id:'old'});
  });
  it('rejects malformed successful responses instead of granting phantom access',async()=>{
    rpc.mockResolvedValue({data:[{organization_id:'org-a'}],error:null});
    await expect(eventOrganizationService.listMyEventOrganizations()).rejects.toThrow(/invalid|incomplete/i);
  });
  it('distinguishes a stale organization edit from a representative handover conflict',async()=>{
    rpc.mockResolvedValue({data:null,error:{code:'40001',message:'Organization changed'}});
    await expect(eventOrganizationService.saveOrganization({id:'org-a',code:'IT',name:'IT Org',isActive:true,expectedUpdatedAt:'2026-01-01T00:00:00Z'})).rejects.toBeInstanceOf(OrganizationRecordChanged);
  });
});
