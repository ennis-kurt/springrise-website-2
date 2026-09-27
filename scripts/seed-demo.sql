-- Local demo seed: publishes Spring 2027 and opens it now, so the public
-- application flow and staff workspace both have something live to try.
-- Run with: npx wrangler d1 execute springrise --local --file scripts/seed-demo.sql
UPDATE seasons SET
  status = 'published',
  opens_at = '2026-09-01T13:00:00.000Z',
  closes_at = '2026-12-16T04:59:00.000Z',
  summary = 'Tuition support for the Spring 2027 semester for students of Turkish descent pursuing higher education in the United States.',
  announcement = 'Applications for the Spring 2027 Tuition Scholarship are now open. We accept requests for your remaining tuition balance after other scholarships and grants — awards are paid directly to your institution. Review the eligibility and requirements below, gather your documents, and apply before the closing date.',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 'spring-2027';
