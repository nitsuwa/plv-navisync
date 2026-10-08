import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabase } from '../../lib/supabase';
import { eventNotificationService, EventNotificationSyncUnavailable, EventNotificationChanged } from '../eventNotificationService';
import type { CampusEventOverlay } from '../../components/map-builder/types';
vi.mock('../../lib/supabase', () => ({ getSupabase: vi.fn() }));
const pending = { id: 'event', status: 'pending', submittedAt: 'submitted', lastEditedAt: 'edited', revision: 4 } as CampusEventOverlay;
let rpc: ReturnType<typeof vi.fn>;
beforeEach(() => { rpc = vi.fn().mockResolvedValue({data:[],error:null}); vi.mocked(getSupabase).mockReturnValue({rpc} as never); });
describe('event server read receipts', () => {
  it('scopes pending candidates to the expected actor and exact displayed revision', async () => {
    rpc.mockResolvedValue({ data: [{event_id:'event',is_current:true,is_read:true}], error:null });
    const states = await eventNotificationService.getStates('admin','admin_submission',[pending]);
    expect(states.get('event')).toEqual({isCurrent:true,isRead:true});
    expect(rpc).toHaveBeenCalledWith('get_event_notification_states',{p_expected_user_id:'admin',p_stream:'admin_submission',p_candidates:[{event_id:'event',payload:['submitted','edited',4]}]});
  });
  it('sends structural Org feedback rather than order-dependent local fingerprints',async()=>{
    const review = {...pending,status:'approved',createdByUserId:'org',adminComment:'Note',locationFeedback:{z:'last',a:'first'}} as CampusEventOverlay;
    await eventNotificationService.acknowledge('org','org_review',review);
    expect(rpc).toHaveBeenCalledWith('ack_event_notification',{p_expected_user_id:'org',p_stream:'org_review',p_event_id:'event',p_payload:['submitted','approved','Note',{z:'last',a:'first'}]});
  });
  it('does not repeatedly request absent RPCs until explicit retry',async()=>{
    rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'Could not find the function public.get_event_notification_states'}});
    await expect(eventNotificationService.getStates('admin','admin_submission',[pending])).rejects.toBeInstanceOf(EventNotificationSyncUnavailable);
    await expect(eventNotificationService.getStates('admin','admin_submission',[pending])).rejects.toBeInstanceOf(EventNotificationSyncUnavailable);
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockResolvedValue({data:[{event_id:'event',is_current:true,is_read:false}],error:null});
    expect((await eventNotificationService.getStates('admin','admin_submission',[pending],true)).get('event')?.isRead).toBe(false);
  });
  it('reports stale acknowledgements without writing another version',async()=>{
    rpc.mockResolvedValue({data:null,error:{code:'40001',message:'Changed'}});
    await expect(eventNotificationService.acknowledge('admin','admin_submission',pending)).rejects.toBeInstanceOf(EventNotificationChanged);
  });
  it('rejects foreign Org acknowledgement before an RPC request',async()=>{
    await expect(eventNotificationService.acknowledge('other','org_review',{...pending,status:'approved',createdByUserId:'org'} as CampusEventOverlay)).rejects.toThrow(/owner/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});
