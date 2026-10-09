import { getSupabase } from './supabase';
export const EVENT_POSTER_BUCKET = 'event_posters';
const posterExtensions: Record<string,string> = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
export async function removeUnusedEventPoster(poster: {url:string;path:string}, _eventId: string): Promise<void> {
  const client = getSupabase();
  const {data,error} = await client.rpc('is_event_poster_referenced', { p_path: poster.path });
  // Check every event, including historical layouts and reused drafts, rather
  // than only the current event. Uncertainty must preserve the public object.
  if (error) throw error;
  if (typeof data !== 'boolean') throw new Error('Poster usage could not be confirmed. The image was kept; retry after refreshing.');
  if (data) return;
  const removed = await client.storage.from(EVENT_POSTER_BUCKET).remove([poster.path]);
  if (removed.error) throw removed.error;
}
export function validateEventPoster(file: File): string | null {
  if (!posterExtensions[file.type]) return 'Choose a JPEG, PNG or WebP image.';
  if (file.size > 5 * 1024 * 1024) return 'The poster must be 5 MB or smaller.';
  return null;
}
export async function uploadEventPoster(file: File): Promise<{url:string;path:string}> {
  const invalid = validateEventPoster(file);
  if (invalid) throw new Error(invalid);
  const client = getSupabase();
  const {data,error:authError} = await client.auth.getUser();
  if (authError || !data.user) throw new Error('Sign in again before uploading a poster. Your proposal details are still here.');
  const path = `${data.user.id}/${crypto.randomUUID()}.${posterExtensions[file.type]}`;
  const {error} = await client.storage.from(EVENT_POSTER_BUCKET).upload(path,file,{contentType:file.type,upsert:false});
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error('Poster uploads need the poster storage migration. You can remove the poster and create this draft, or ask the administrator to apply the update.');
    throw new Error(`Poster upload failed: ${error.message}`);
  }
  return {path,url:client.storage.from(EVENT_POSTER_BUCKET).getPublicUrl(path).data.publicUrl};
}
