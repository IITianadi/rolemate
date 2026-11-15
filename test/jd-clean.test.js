import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanJdText } from '../server/lib/jd-clean.js';

// Shape of a LinkedIn search page read whole: results list, the job's top card, the description, then LinkedIn panels.
const page = `99+ results
San Francisco, CA (80 km)
How promoted jobs are ranked
·
How AI search works
Agent Behavior Specialist
Agent Behavior Specialist
Hark
San Jose, CA
Office
Posted 1 hour ago
Product Designer
Acme
Promoted
Easy Apply
Hark
Share
Show more options
Agent Behavior Specialist
San Jose, CA · 1 hour ago · Over 100 applicants
On-site
Full-time
Apply
Save
Save Agent Behavior Specialist at Hark
About the job
Hark is building voice agents for restaurants. As an Agent Behavior Specialist you will shape how our agents talk to guests.

Responsibilities
Design and test conversation flows for ordering and reservations
Review call transcripts every week and fix failure patterns
Work with engineering to ship prompt and policy changes

Requirements
2+ years in conversation design, QA or support operations
Strong written English
… more
Set alert for similar jobs
About the company
Hark
1,200 followers
Interested in working with us in the future?`;

test('LinkedIn page: keeps only the posting, drops list, buttons and company panel', () => {
  const t = cleanJdText(page, { source: 'linkedin.com' });
  assert.ok(t.startsWith('Hark is building voice agents'));
  assert.ok(t.includes('Responsibilities\nDesign and test conversation flows'));
  assert.ok(t.endsWith('Strong written English'));
  for (const junk of ['99+ results', 'How promoted', 'Easy Apply', 'Set alert', 'followers', 'Product Designer']) assert.ok(!t.includes(junk), junk);
});

test('a clean description is left alone', () => {
  const d = 'We are hiring a Data Analyst.\n\nWhat you will do\nBuild dashboards in Tableau\nWrite SQL every day\nPresent to leadership weekly';
  assert.equal(cleanJdText(d), d);
});

test('too little left after cleaning: keeps the original', () => {
  const d = 'About the job\nApply\nSave\nShort.';
  assert.equal(cleanJdText(d), d);
});
