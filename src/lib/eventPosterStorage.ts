import { getSupabase } from './supabase';
export const EVENT_POSTER_BUCKET = 'event_posters';
const posterExtensions: Record<string,string> = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
export async function removeUnusedEventPoster(poster: {url:string;path:string}, eventId: string): Promise<void> {
  const client = getSupabase();
  const {data,error} = await client.from('map_elements').select('metadata').eq('id',eventId).maybeSingle();
  // A failed response does not prove that the preceding save failed to commit.
  // Leave the image intact if we cannot confirm whether it is still referenced.
  if (error) throw error;
  if ((data?.metadata as Record<string,unknown> | undefined)?.posterUrl === poster.url) return;
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
