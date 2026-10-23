-- A calendar event can carry a video conference. The calendar does not host
-- the call: it stores the provider, the provider's stable identifier and the
-- link people open to join. Everything else about the call (admission, who is
-- in the room, recording) stays with the provider.
ALTER TABLE calendar_event
  ADD COLUMN conference jsonb
  CHECK (conference IS NULL OR jsonb_typeof(conference) = 'object');
