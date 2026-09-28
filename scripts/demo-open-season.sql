-- LOCAL DEMO ONLY — do not run against the production database.
--   npx wrangler d1 execute springrise --local --file scripts/demo-open-season.sql
-- Publishes the Spring 2027 draft with an open application window
-- (Sep 1, 2026 9:00 AM EDT – Dec 15, 2026 11:59 PM EST) so the apply flow can be exercised.
UPDATE seasons SET
  status = 'published',
  opens_at = '2026-09-01T13:00:00.000Z',
  closes_at = '2026-12-16T04:59:00.000Z',
  headline = 'Applications are open for Spring 2027 tuition support.',
  announcement = 'Springrise Foundation is now accepting scholarship applications for the Spring 2027 semester. Awards help students of Turkish descent cover the tuition they still owe after other scholarships and grants, and are paid directly to their college or university.

Applications close on December 15, 2026 at 11:59 PM Eastern. Have your resume, latest transcript, proof of enrollment, personal statement and tuition bill ready as PDFs, along with contact details for two references.

Questions? Write to scholarship@springrise.org.',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE slug = 'spring-2027';
