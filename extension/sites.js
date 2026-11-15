// Job sites Rolemate captures from: the 50 most used by job seekers in India.
// hosts: the site's address (sub-domains included). job: how a single job post's address looks on that site.
// A page that doesn't match `job` is still accepted when it publishes a JobPosting (structured data) or the user has
// selected the job text, because some sites show one job without a distinct address.
'use strict';

const SITES = [
  // Job boards
  { name: 'LinkedIn', hosts: ['linkedin.com'], job: /\/jobs\/view\/|[?&]currentJobId=|\/posts\/|\/feed\/update\// },
  { name: 'Naukri', hosts: ['naukri.com'], job: /job-listings-|\/job-detail/ },
  { name: 'Indeed', hosts: ['indeed.com', 'indeed.co.in'], job: /\/viewjob|[?&](vjk|jk)=|\/rc\/clk/ },
  { name: 'foundit (Monster)', hosts: ['foundit.in', 'monsterindia.com'], job: /\/job\// },
  { name: 'Glassdoor', hosts: ['glassdoor.co.in', 'glassdoor.com'], job: /job-listing|[?&]jl=|JV_/ },
  { name: 'Instahyre', hosts: ['instahyre.com'], job: /\/job-/ },
  { name: 'Cutshort', hosts: ['cutshort.io'], job: /\/job\// },
  { name: 'Wellfound', hosts: ['wellfound.com', 'angel.co'], job: /\/jobs\/\d|\/l\/|[?&]job_listing_id=/ },
  { name: 'IIMJobs', hosts: ['iimjobs.com'], job: /\/j\// },
  { name: 'Hirist', hosts: ['hirist.tech', 'hirist.com'], job: /\/j\// },
  { name: 'Shine', hosts: ['shine.com'], job: /\/jobs\/[^/]+\/[^/]+\/\d+|\/job-detail/ },
  { name: 'TimesJobs', hosts: ['timesjobs.com'], job: /job-detail|jobdetail/i },
  { name: 'apna', hosts: ['apna.co'], job: /\/job\// },
  { name: 'Internshala', hosts: ['internshala.com'], job: /\/(job|internship)\/detail\// },
  { name: 'Unstop', hosts: ['unstop.com'], job: /\/(jobs|internships|o)\/[^/]+-\d+/ },
  { name: 'Freshersworld', hosts: ['freshersworld.com'], job: /-\d{5,}/ },
  { name: 'WorkIndia', hosts: ['workindia.in'], job: /\/jobs?\/.+\d/ },
  { name: 'Jobhai', hosts: ['jobhai.com'], job: /\/job/ },
  { name: 'Hirect', hosts: ['hirect.in'], job: /\/job/ },
  { name: 'PlacementIndia', hosts: ['placementindia.com'], job: /job-detail|\/jobs\/.+\d/ },
  { name: 'Work at a Startup (YC)', hosts: ['workatastartup.com', 'ycombinator.com'], job: /\/jobs\/\d+|\/companies\/[^/]+\/jobs\/[^/]+/ },
  { name: 'Michael Page', hosts: ['michaelpage.co.in'], job: /\/job-detail\// },
  { name: 'Randstad', hosts: ['randstad.in'], job: /\/jobs\/[^/]+_\d|\/jobs\/.+\d{4,}/ },
  { name: 'Hasjob', hosts: ['hasjob.co'], job: /\/\d{4}-\d{2}-\d{2}\/|\/[a-z0-9]{5}\/?$/ },
  { name: 'Naukri Campus', hosts: ['naukricampus.com'], job: /\/job|\/opportunit/ },

  // Hiring systems behind company career pages
  { name: 'Greenhouse', hosts: ['greenhouse.io'], job: /\/jobs\/\d+/ },
  { name: 'Lever', hosts: ['lever.co'], job: /\/[0-9a-f]{8}-[0-9a-f]{4}-/ },
  { name: 'Workday', hosts: ['myworkdayjobs.com', 'myworkdaysite.com'], job: /\/job\// },
  { name: 'Ashby', hosts: ['ashbyhq.com'], job: /\/[0-9a-f]{8}-[0-9a-f]{4}-/ },
  { name: 'SmartRecruiters', hosts: ['smartrecruiters.com'], job: /\/\d{9,}/ },
  { name: 'Workable', hosts: ['workable.com'], job: /\/j\/|\/jobs\/\d+/ },
  { name: 'Zoho Recruit', hosts: ['zohorecruit.com', 'zohorecruit.in'], job: /\/jobs\/[^/]+\/\d+|[?&]jobId=|\/job-details/i },
  { name: 'Darwinbox', hosts: ['darwinbox.in', 'darwinbox.com'], job: /job-?details|jobDetails|\/careers\/([^/]+\/)?[a-z0-9]{10,}/i },
  { name: 'Keka', hosts: ['keka.com'], job: /jobdetails|\/careers\/.+\d/i },
  { name: 'Freshteam', hosts: ['freshteam.com'], job: /\/jobs\/[^/]+/ },
  { name: 'Recruitee', hosts: ['recruitee.com'], job: /\/o\// },
  { name: 'Breezy HR', hosts: ['breezy.hr'], job: /\/p\// },
  { name: 'Jobvite', hosts: ['jobvite.com'], job: /\/job\// },
  { name: 'iCIMS', hosts: ['icims.com'], job: /\/jobs\/\d+/ },
  { name: 'SAP SuccessFactors', hosts: ['successfactors.com', 'successfactors.eu', 'jobs.sap.com'], job: /\/job\/|career_job_req_id|jobReqId/i },
  { name: 'Oracle Recruiting', hosts: ['oraclecloud.com', 'taleo.net'], job: /\/job\/\d+|jobdetail/i },
  { name: 'Teamtailor', hosts: ['teamtailor.com'], job: /\/jobs\/\d+/ },
  { name: 'Personio', hosts: ['personio.de', 'personio.com'], job: /\/job\/\d+/ },
  { name: 'Rippling', hosts: ['rippling.com'], job: /\/jobs\/[0-9a-f-]{8,}/ },
  { name: 'BambooHR', hosts: ['bamboohr.com'], job: /\/careers\/\d+/ },
  { name: 'Superset', hosts: ['joinsuperset.com'], job: /\/job|\/opportunit/ },

  // Large employers' own career sites
  { name: 'Google Careers', hosts: ['careers.google.com', 'google.com'], job: /\/careers\/.*jobs\/results\/\d+|\/jobs\/results\/\d+/ },
  { name: 'Amazon Jobs', hosts: ['amazon.jobs'], job: /\/jobs\/\d+/ },
  { name: 'Microsoft Careers', hosts: ['careers.microsoft.com', 'microsoft.com'], job: /\/job\/\d+|\/global\/en\/job\// },
  { name: 'TCS / Infosys / Wipro careers', hosts: ['ibegin.tcs.com', 'career.infosys.com', 'careers.wipro.com'], job: /job|requisition|position/i },
];

// The site entry for an address, or null when it isn't one of the supported sites.
function findSite(url) {
  let u; try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const site = SITES.find((s) => s.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  if (!site) return null;
  // google.com / microsoft.com are only supported on their careers sections.
  if (site.name === 'Google Careers' && host === 'google.com' && !/\/about\/careers|\/careers/.test(u.pathname)) return null;
  if (site.name === 'Microsoft Careers' && host === 'microsoft.com' && !/careers/.test(u.pathname)) return null;
  return { ...site, isJobUrl: site.job.test(u.pathname + u.search) };
}
