-- PREPARED PROTOCOL CHECK ONLY; NOT EXECUTED. Not an RLS/authorization test.
-- Later authorized staging operator verifies the pure isolation guard rejects
-- a transaction-pinned stale snapshot. No JWT is forged and no business row is read.
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $isolation$ BEGIN
 IF current_user<>'postgres' OR current_setting('igotu.test.probe_authorized',true) IS DISTINCT FROM 'true'
 OR current_setting('igotu.integration.project_ref',true)='giqtnbwyktbnbhdvjraa'
 OR NOT EXISTS(SELECT 1 FROM igotu_backend_private.installation WHERE phase=4 AND project_ref=current_setting('igotu.integration.project_ref',true))
 THEN RAISE EXCEPTION 'Authorized isolated staging protocol check required.'; END IF;
 BEGIN
  PERFORM igotu_backend_private.require_read_committed();
  RAISE EXCEPTION 'FAIL: unsupported isolation was accepted.';
 EXCEPTION WHEN SQLSTATE '25001' THEN RAISE NOTICE 'PASS protocol rejection only; RLS and concurrency not established.';
 END;
END $isolation$;
ROLLBACK;
