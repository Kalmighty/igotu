-- PREPARED INTERACTIVE STAGING LOCK PROCEDURE; NOT EXECUTED.
-- After separate approval, use \i inside an interactive psql session. The
-- transaction remains open; the operator must COMMIT/ROLLBACK after launching
-- the real-JWT API requests. Never use operator SQL as an authorization test.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $barrier$ DECLARE subject uuid:=current_setting('igotu.test.provider')::uuid; BEGIN
 IF current_user<>'postgres' OR current_setting('igotu.test.probe_authorized',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.project_ref',true)='giqtnbwyktbnbhdvjraa'
 OR NOT EXISTS(SELECT 1 FROM igotu_backend_private.installation WHERE phase=4 AND project_ref=current_setting('igotu.integration.project_ref',true))
 OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=subject AND role::text='provider' AND full_name LIKE 'Synthetic %')
 THEN RAISE EXCEPTION 'Separately approved synthetic Provider lock procedure required.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(subject::text,61026));
END $barrier$;
-- No automatic wait/commit. Continue in operator-tests.md, then release the
-- interactive transaction explicitly. Connection loss rolls it back.
