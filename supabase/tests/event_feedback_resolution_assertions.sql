-- Run after the feedback-resolution migration. Read-only checks, rolled back.
BEGIN;
DO $$
declare v_feedback text := '@event-feedback/v1:{"text":"","pins":[{"id":"pin","x":1,"y":2,"comment":"Move booth"}]}'; v_metadata jsonb;
begin
  v_metadata := jsonb_build_object('locationFeedback', jsonb_build_object('campus', v_feedback));
  if (select count(*) from public.event_feedback_pins(v_metadata)) <> 1 then raise exception 'Pin decoder failed'; end if;
  if public.event_feedback_fully_addressed(v_metadata) then raise exception 'Open pin incorrectly accepted'; end if;
  v_metadata := v_metadata || jsonb_build_object('feedbackResolutions', jsonb_build_object('campus', jsonb_build_object('pin',
    jsonb_build_object('feedback', v_feedback, 'addressedAt', now(), 'addressedBy', 'owner', 'note', 'Moved'))));
  if not public.event_feedback_fully_addressed(v_metadata) then raise exception 'Addressed pin incorrectly rejected'; end if;
  v_metadata := jsonb_set(v_metadata, '{locationFeedback,campus}', to_jsonb(replace(v_feedback, 'Move booth', 'Keep entrance clear')));
  if public.event_feedback_fully_addressed(v_metadata) then raise exception 'Stale acknowledgement incorrectly accepted'; end if;
  if not public.event_feedback_fully_addressed('{"locationFeedback":{"campus":"Legacy comment"}}') then raise exception 'Legacy comment blocked'; end if;
  if not public.event_feedback_fully_addressed('{"locationFeedback":null}') then raise exception 'Null feedback blocked'; end if;
  if has_function_privilege('anon', 'public.set_event_feedback_pin_addressed(uuid,timestamptz,text,text,boolean,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.set_event_feedback_pin_addressed(uuid,timestamptz,text,text,boolean,text)', 'EXECUTE') then
    raise exception 'Unsafe feedback command grants'; end if;
end $$;
ROLLBACK;
