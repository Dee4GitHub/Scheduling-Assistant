-- db:reset — wipe transactional data back to the post-seed state.
--
-- Drops every job and notification, and flips every quote back to
-- 'unscheduled'. The directories (managers, technicians, quote
-- references) are preserved so the demo always starts from the same
-- 5 managers / 5 technicians / 10 quote references the seed inserted.
--
-- Why UPDATE quotes, not TRUNCATE: TRUNCATE would reset the
-- auto-increment ids and break any saved external references to
-- specific Q-#### quotes. Status reset is what we actually want.
--
-- FK checks are toggled off only because jobs.quote_id and
-- notifications.job_id have FK constraints we'd otherwise have to
-- delete-order around. Re-enabled on the way out.

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE notifications;
TRUNCATE TABLE jobs;
UPDATE quotes SET status = 'unscheduled';
SET FOREIGN_KEY_CHECKS = 1;

SELECT
  (SELECT COUNT(*) FROM quotes WHERE status = 'unscheduled') AS unscheduled_quotes,
  (SELECT COUNT(*) FROM jobs) AS jobs,
  (SELECT COUNT(*) FROM notifications) AS notifications;
