-- PREPARED OPERATOR FIXTURE ONLY. NOT EXECUTED. Not a rollout migration.
-- Separate staging DDL/test-write approval required; NEVER production.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $probe$ DECLARE subject uuid:=current_setting('igotu.test.provider')::uuid; BEGIN
 IF current_user<>'postgres' OR current_setting('igotu.test.probe_authorized',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.project_ref',true)='giqtnbwyktbnbhdvjraa'
 OR NOT EXISTS(SELECT 1 FROM igotu_backend_private.installation WHERE phase=4 AND project_ref=current_setting('igotu.integration.project_ref',true))
 OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=subject AND role::text='provider' AND full_name LIKE 'Synthetic %')
 THEN RAISE EXCEPTION 'Explicitly authorized synthetic Provider in installed isolated staging required.'; END IF;
 -- NOT VALID preserves existing fixtures, but new General Cleaning rows for this
 -- one synthetic Provider fail after the RPC has changed profile/skills.
 EXECUTE format('ALTER TABLE public.provider_specializations ADD CONSTRAINT igotu_v7_atomic_probe CHECK (provider_id <> %L::uuid OR specialization <> %L) NOT VALID',subject,'General Cleaning');
END $probe$;
COMMIT;
