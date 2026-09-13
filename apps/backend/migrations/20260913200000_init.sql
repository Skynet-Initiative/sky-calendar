CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id varchar(128) NOT NULL,
  name varchar(100) NOT NULL,
  color char(7) NOT NULL DEFAULT '#2563eb' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  time_zone varchar(100) NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX calendar_workspace_id_idx ON calendar (workspace_id);

CREATE TABLE calendar_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES calendar(id) ON DELETE CASCADE,
  title varchar(300) NOT NULL CHECK (length(btrim(title)) > 0),
  description text,
  location varchar(500),
  start timestamptz NOT NULL,
  "end" timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  time_zone varchar(100) NOT NULL,
  recurrence_rule varchar(2000),
  recurrence_exceptions timestamptz[] NOT NULL DEFAULT '{}',
  status varchar(16) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  visibility varchar(16) NOT NULL DEFAULT 'default' CHECK (visibility IN ('default', 'public', 'private')),
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attendees) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_event_positive_duration CHECK ("end" > start)
);

CREATE INDEX calendar_event_calendar_id_start_end_idx ON calendar_event (calendar_id, start, "end");
