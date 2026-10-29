"""Offline parse/structural checks only. Never opens a database connection."""
from pathlib import Path
from pglast import parse_sql, parse_plpgsql
root=Path(__file__).resolve().parents[1]
proposal=(root/'docs/private-request-images/proposal.sql').read_text()
read_only=(root/'docs/private-request-images/preflight-read-only.sql').read_text()
assert len(parse_sql(proposal)) >= 20
parse_plpgsql(proposal)
parse_sql(read_only)
assert 'BEGIN READ ONLY' in read_only
assert "reviewed_save_md5" in proposal and "reviewed_storage_policies_md5" in proposal
assert "igotu.images.execution_approved" in proposal
assert "storage.allow_only_operation('object.get_authenticated')" in proposal
assert "reviewed_operation_md5" in proposal
assert "IS DISTINCT FROM 'oqalpauljjhytnrpzcqp'" in proposal
assert "AS RESTRICTIVE FOR SELECT TO anon,authenticated" in proposal
assert "AS RESTRICTIVE FOR INSERT TO anon,authenticated" in proposal
assert "AS RESTRICTIVE FOR UPDATE TO anon,authenticated" in proposal
assert "AS RESTRICTIVE FOR DELETE TO anon,authenticated" in proposal
assert "('confirmed','in_progress','completed')" in proposal
assert "workspace('provider')" in proposal and "workspace('client')" in proposal
assert 'DROP POLICY' not in proposal and 'DELETE FROM' not in proposal
assert 'request_image_url=NULL' in proposal and "SET public=false" in proposal
assert 'public=true' not in proposal
print('PASS: SQL and PL/pgSQL parse, staging/approval/fingerprint gates, restrictive Storage boundaries and no destructive repair statements. This is not live catalog/RLS proof.')
