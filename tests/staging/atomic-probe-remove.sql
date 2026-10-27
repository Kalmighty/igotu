-- PREPARED CLEANUP ONLY. NOT EXECUTED. Separate synthetic-fixture DDL approval.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $probe$ DECLARE definition text;subject uuid:=current_setting('igotu.test.provider')::uuid; BEGIN
 IF current_user<>'postgres' OR current_setting('igotu.test.probe_authorized',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.project_ref',true)='giqtnbwyktbnbhdvjraa'
 OR NOT EXISTS(SELECT 1 FROM igotu_backend_private.installation WHERE phase=4 AND project_ref=current_setting('igotu.integration.project_ref',true))
 THEN RAISE EXCEPTION 'Authorized isolated staging cleanup required.'; END IF;
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conrelid='public.provider_specializations'::regclass AND conname='igotu_v7_atomic_probe';
 IF definition IS NULL OR position(subject::text IN definition)=0 OR position('General Cleaning' IN definition)=0 THEN RAISE EXCEPTION 'Expected synthetic probe not found; do not remove another constraint.'; END IF;
 ALTER TABLE public.provider_specializations DROP CONSTRAINT igotu_v7_atomic_probe;
END $probe$;
COMMIT;
