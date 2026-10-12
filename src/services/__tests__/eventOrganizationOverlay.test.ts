import {beforeEach,describe,expect,it,vi} from 'vitest';
import {getSupabase} from '../../lib/supabase';
import {campusService} from '../campusService';
import {eventOverlayService} from '../eventOverlayService';
vi.mock('../../lib/supabase',()=>({getSupabase:vi.fn()}));
vi.mock('../campusService',()=>({resolveActiveCampusId:vi.fn().mockResolvedValue('campus-1'),campusService:{listPublishedSnapshots:vi.fn()}}));
vi.mock('../activityLogService',()=>({logActivity:vi.fn().mockResolvedValue(undefined)}));
const context={organizationId:'org-a',organizationName:'IT',grantId:'new-grant',academicYear:'2026–2027',expiresAt:'2027-06-01T00:00:00Z'};
const location={id:'campus-grounds',locationRef:{type:'campus' as const,label:'Campus Grounds'},eventFurniture:[],eventLabels:[]};
let row:Record<string,unknown>,rpc:ReturnType<typeof vi.fn>,directUpdate:ReturnType<typeof vi.fn>,directDelete:ReturnType<typeof vi.fn>;
beforeEach(()=>{
  row={id:'20000000-0000-4000-8000-000000000001',campus_id:'campus-1',organization_id:'org-a',created_at:'2025-03-01T00:00:00Z',updated_at:'2026-10-09T00:00:00Z',metadata:{title:'Inherited draft',organizer:'IT',status:'draft',createdByUserId:'old-representative',locations:[location],organizationId:'spoofed-org'}};
  const query={select:vi.fn(),eq:vi.fn(),or:vi.fn(),is:vi.fn(),single:vi.fn(async()=>({data:row,error:null})),maybeSingle:vi.fn(async()=>({data:row,error:null})),order:vi.fn(async()=>({data:[row],error:null}))};
  query.select.mockReturnValue(query);query.eq.mockReturnValue(query);query.or.mockReturnValue(query);query.is.mockReturnValue(query);
  directUpdate=vi.fn(()=>query);
  directDelete=vi.fn(()=>query);
  rpc=vi.fn(async()=>({data:{id:row.id,campusId:row.campus_id,organizationId:row.organization_id,createdAt:row.created_at,updatedAt:row.updated_at,metadata:row.metadata,archivedAt:'2025-12-01T00:00:00Z'},error:null}));
  const insert=vi.fn((payload:{id:string})=>({select:vi.fn(()=>({single:vi.fn(async()=>({data:{id:payload.id},error:null}))}))}));
  vi.mocked(getSupabase).mockReturnValue({from:vi.fn(()=>({select:vi.fn(()=>query),update:directUpdate,delete:directDelete,insert})),rpc} as never);
  vi.mocked(campusService.listPublishedSnapshots).mockResolvedValue([{id:'campus-1',buildings:[]}] as never);
});
describe('organization-bound event service',()=>{
  it('creates a proposal with its verified organization and displayed grant',async()=>{
    rpc.mockResolvedValue({data:{id:row.id,campusId:'campus-1',organizationId:'org-a',updatedAt:row.updated_at,metadata:{...(row.metadata as object),createdByUserId:'new-representative'}},error:null});
    const event=await eventOverlayService.createEventOverlay({requestId:String(row.id),title:'New proposal',organizer:'IT',locations:[location],organization:context},'new-representative','campus-1');
    expect(event).toMatchObject({organizationId:'org-a',createdByUserId:'new-representative'});
    expect(rpc).toHaveBeenCalledWith('create_organization_event',expect.objectContaining({p_organization_id:'org-a',p_expected_grant_id:'new-grant',p_academic_year:'2026–2027'}));
    expect(rpc.mock.calls[0][1].p_metadata).not.toHaveProperty('createdByUserId');
    expect(rpc.mock.calls[0][1].p_metadata).not.toHaveProperty('publicationAt');
  });
  it('hydrates organization ownership from the relational field, not editable metadata',async()=>{
    const event=await eventOverlayService.getEventOverlay(String(row.id));
    expect(event).toMatchObject({organizationId:'org-a',createdByUserId:'old-representative',createdAt:'2025-03-01T00:00:00Z'});
  });
  it('uses expected assignment and server mutation for inherited draft details',async()=>{
    await eventOverlayService.updateEventOverlayDetails(String(row.id),{title:'New title',description:'Updated',organizer:'IT',locations:[location.locationRef]},String(row.updated_at),'new-grant');
    expect(rpc).toHaveBeenCalledWith('mutate_organization_event',expect.objectContaining({p_event_id:row.id,p_expected_updated_at:row.updated_at,p_expected_grant_id:'new-grant',p_command:'details',p_changes:expect.objectContaining({title:'New title',description:'Updated'})}));
    expect(directUpdate).not.toHaveBeenCalled();
  });
  it('refuses a bound-event save without the displayed grant',async()=>{
    await expect(eventOverlayService.updateEventOverlayLayout(String(row.id),[location],String(row.updated_at))).rejects.toThrow(/assignment|representative|refresh/i);
    expect(directUpdate).not.toHaveBeenCalled();
  });
  it('keeps original creator identity in the returned inherited layout',async()=>{
    const result=await eventOverlayService.updateEventOverlayLayout(String(row.id),[location],String(row.updated_at),'new-grant');
    expect(result).toMatchObject({organizationId:'org-a',createdByUserId:'old-representative'});
    expect(rpc).toHaveBeenCalledWith('mutate_organization_event',expect.objectContaining({p_command:'layout',p_expected_grant_id:'new-grant'}));
    expect(directUpdate).not.toHaveBeenCalled();
  });
  it('uses a protected history read for an archived event',async()=>{
    const event=await eventOverlayService.getEventOverlay(String(row.id),true);
    expect(event).toMatchObject({organizationId:'org-a',archivedAt:'2025-12-01T00:00:00Z'});
    expect(rpc).toHaveBeenCalledWith('get_organization_event',{p_event_id:row.id});
  });
  it('deletes a bound draft using the displayed grant and verifies server confirmation',async()=>{
    rpc.mockResolvedValue({data:{id:row.id,deleted:true},error:null});
    await eventOverlayService.deleteEventOverlay(String(row.id),'new-grant');
    expect(rpc).toHaveBeenCalledWith('mutate_organization_event',expect.objectContaining({p_expected_grant_id:'new-grant',p_command:'delete',p_expected_updated_at:row.updated_at}));
    expect(directDelete).not.toHaveBeenCalled();
  });
  it('requires the displayed grant before resolving feedback for a bound event',async()=>{
    row.metadata={...(row.metadata as object),locationFeedback:{'campus-grounds':[{id:'pin-1',comment:'Check this'}]}};
    const overlay=await eventOverlayService.getEventOverlay(String(row.id));
    await expect(eventOverlayService.setEventFeedbackPinAddressed(overlay!,'campus-grounds','pin-1',true,'Checked')).rejects.toThrow(/assignment|representative|refresh/i);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('resolves bound feedback with the displayed grant token',async()=>{
    row.metadata={...(row.metadata as object),locationFeedback:{'campus-grounds':[{id:'pin-1',comment:'Check this'}]}};
    const overlay=await eventOverlayService.getEventOverlay(String(row.id));
    await eventOverlayService.setEventFeedbackPinAddressed(overlay!,'campus-grounds','pin-1',true,'Checked','new-grant');
    expect(rpc).toHaveBeenCalledWith('set_organization_event_feedback_pin_addressed',expect.objectContaining({p_overlay_id:row.id,p_expected_updated_at:row.updated_at,p_expected_grant_id:'new-grant',p_location_id:'campus-grounds',p_pin_id:'pin-1',p_addressed:true,p_note:'Checked'}));
  });
  it('withdraws an inherited pending event with the displayed grant token',async()=>{
    row.metadata={...(row.metadata as object),status:'pending'};
    await eventOverlayService.withdrawEventSubmission(String(row.id),String(row.updated_at),'new-grant');
    expect(rpc).toHaveBeenCalledWith('mutate_organization_event',expect.objectContaining({p_event_id:row.id,p_expected_updated_at:row.updated_at,p_expected_grant_id:'new-grant',p_command:'withdraw',p_changes:{}}));
  });
  it('shows reconciliation suggestions without assigning a legacy event',async()=>{
    rpc.mockResolvedValue({data:[{eventId:row.id,campusId:'campus-1',title:'Legacy event',status:'draft',creatorUserId:'old',creatorName:'Old Student',organizerLabel:'IT',createdAt:row.created_at,updatedAt:row.updated_at,archivedAt:null,academicYear:null,suggestedOrganizationId:'org-a',suggestedOrganizationName:'IT',validation:'academic_year_required'}],error:null});
    const result=await eventOverlayService.listLegacyEventReconciliation();
    expect(result[0]).toMatchObject({eventId:row.id,creatorUserId:'old',suggestedOrganizationId:'org-a',validation:'academic_year_required'});
    expect(rpc).toHaveBeenCalledWith('admin_preview_event_organization_reconciliation');
    expect(directUpdate).not.toHaveBeenCalled();
  });
  it('binds a legacy event only after an explicit admin selection',async()=>{
    await eventOverlayService.bindLegacyEventOrganization({eventId:String(row.id),organizationId:'org-a',academicYear:'2025–2026',expectedUpdatedAt:String(row.updated_at)});
    expect(rpc).toHaveBeenCalledWith('admin_bind_event_organization',{p_event_id:row.id,p_organization_id:'org-a',p_academic_year:'2025–2026',p_expected_updated_at:row.updated_at});
    expect(directUpdate).not.toHaveBeenCalled();
  });
  it('corrects a wrong legacy assignment with the expected owner and an audit reason',async()=>{
    await eventOverlayService.correctEventOrganization({eventId:String(row.id),organizationId:'org-b',academicYear:'2025–2026',expectedOrganizationId:'org-a',expectedUpdatedAt:String(row.updated_at),reason:'Verified with the organization'});
    expect(rpc).toHaveBeenCalledWith('admin_correct_event_organization',{p_event_id:row.id,p_organization_id:'org-b',p_academic_year:'2025–2026',p_expected_organization_id:'org-a',p_expected_updated_at:row.updated_at,p_reason:'Verified with the organization'});
    expect(directUpdate).not.toHaveBeenCalled();
  });
});
