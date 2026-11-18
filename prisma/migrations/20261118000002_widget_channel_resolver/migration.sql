-- Security Definer Function: resolve_widget_channel
-- Purpose: Safely resolves public Web Chat channel metadata for widget session initialization
-- without granting open SELECT privileges on the channels table to unauthenticated callers.

CREATE OR REPLACE FUNCTION resolve_widget_channel(
  p_channel_id UUID
)
RETURNS TABLE (
  channel_id UUID,
  organization_id UUID,
  channel_name VARCHAR,
  status VARCHAR,
  config JSONB
)
LANGUAGE plpgsql
STRICT
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_channel_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    c.id AS channel_id,
    c.organization_id,
    c.name AS channel_name,
    c.status,
    c.config::JSONB
  FROM channels c
  WHERE c.id = p_channel_id
    AND c.provider = 'WEB_CHAT'
    AND c.status = 'ACTIVE'
    AND c.deleted_at IS NULL
  LIMIT 1;
END;
$$;

ALTER FUNCTION resolve_widget_channel(UUID) OWNER TO orbit_migrator;
REVOKE ALL ON FUNCTION resolve_widget_channel(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_widget_channel(UUID) TO orbit_app;
