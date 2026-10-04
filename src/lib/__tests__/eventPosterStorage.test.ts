import { beforeEach, expect, it, vi } from 'vitest';
import { getSupabase } from '../supabase';
import { removeUnusedEventPoster, uploadEventPoster, validateEventPoster } from '../eventPosterStorage';
vi.mock('../supabase', () => ({ getSupabase: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it('does not delete a poster already referenced by an event after a lost save response', async () => {
  const remove=vi.fn();
  vi.mocked(getSupabase).mockReturnValue({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{metadata:{posterUrl:'https://example.test/used.png'}},error:null})})})}),storage:{from:()=>({remove})}} as never);
  await removeUnusedEventPoster({url:'https://example.test/used.png',path:'org/file.png'},'event-id');
  expect(remove).not.toHaveBeenCalled();
});
it('rejects unsupported and oversized files before calling storage', () => {
  expect(validateEventPoster(new File(['svg'], 'poster.svg', {type:'image/svg+xml'}))).toMatch(/JPEG, PNG or WebP/);
  expect(validateEventPoster({type:'image/png',size:5242881} as File)).toMatch(/5 MB/);
  expect(getSupabase).not.toHaveBeenCalled();
});
it('uploads to an authenticated owner folder with an unpredictable filename', async () => {
  const upload=vi.fn().mockResolvedValue({error:null});
  const from=vi.fn(()=>({upload,getPublicUrl:vi.fn(()=>({data:{publicUrl:'https://example.test/poster.png'}}))}));
  vi.mocked(getSupabase).mockReturnValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'org-id'}},error:null})},storage:{from}} as never);
  const result=await uploadEventPoster(new File(['png'],'poster.png',{type:'image/png'}));
  expect(result?.url).toBe('https://example.test/poster.png');
  expect(from).toHaveBeenCalledWith('event_posters');
  expect(upload.mock.calls[0][0]).toMatch(/^org-id\/[0-9a-f-]+\.png$/);
  expect(upload.mock.calls[0][2]).toEqual({contentType:'image/png',upsert:false});
});
it('keeps missing storage configuration actionable and never reports a URL after failure', async () => {
  vi.mocked(getSupabase).mockReturnValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'org-id'}},error:null})},storage:{from:()=>({upload:vi.fn().mockResolvedValue({error:{message:'Bucket not found'}})})}} as never);
  await expect(uploadEventPoster(new File(['png'],'poster.png',{type:'image/png'}))).rejects.toThrow(/poster storage migration/i);
});
