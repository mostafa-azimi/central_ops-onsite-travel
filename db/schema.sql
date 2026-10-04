CREATE TABLE IF NOT EXISTS visit_requests (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  trip_type text NOT NULL CHECK (trip_type IN ('Onboarding', 'Central Ops onsite')),
  cash_url text NOT NULL,
  cash_account_id text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  start_date date NOT NULL,
  end_date_inclusive date NOT NULL,
  assigned_traveler text CHECK (assigned_traveler IN ('Chris Haun', 'Mike Azimi', 'Rob McFaul', 'Sam Armenia')),
  decided_at timestamptz,
  decided_by_email text,
  calendar_event_id text,
  calendar_event_url text,
  hubspot_meeting_id text,
  hubspot_company_id text,
  sync_status text NOT NULL DEFAULT 'not_started' CHECK (sync_status IN ('not_started', 'syncing_calendar', 'syncing_hubspot', 'complete', 'failed')),
  sync_started_at timestamptz,
  sync_attempts integer NOT NULL DEFAULT 0,
  sync_error text,
  CHECK (end_date_inclusive >= start_date),
  CHECK ((status = 'approved' AND assigned_traveler IS NOT NULL) OR status <> 'approved')
);

CREATE INDEX IF NOT EXISTS visit_requests_status_created_idx
  ON visit_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS visit_request_audit (
  id bigserial PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES visit_requests(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_email text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
