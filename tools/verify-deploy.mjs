#!/usr/bin/env node
// Verifies that a deployed ResidentHub site serves exactly the files of a git revision.
// A partial upload (e.g. new HTML without auth-page.js) breaks login/guards silently,
// so run this after every deploy.
//
//   node tools/verify-deploy.mjs http://162.4.176.164          # compare with HEAD
//   node tools/verify-deploy.mjs http://162.4.176.164 origin/main
//
// Read-only: only GET requests to the site; nothing is uploaded or written.
import { execFileSync } from 'node:child_process';

const [base, rev = 'HEAD'] = process.argv.slice(2);
if (!base) { console.error('Usage: node tools/verify-deploy.mjs <siteUrl> [gitRevision]'); process.exit(2); }
const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
// Served by the browser: top-level pages/scripts/styles and the committed bundles.
const files = git('ls-tree', '-r', '--name-only', rev).toString().split('\n')
    .filter(f => /^[^/]+\.(html|js|css)$/.test(f) || /^dist\/.+\.(js|css)$/.test(f));
const normalize = buf => Buffer.from(buf).toString('utf8').replace(/\r\n/g, '\n');

const problems = [];
let checked = 0;
await Promise.all(files.map(async file => {
    const url = new URL(file, base.replace(/\/?$/, '/')).href;
    let res;
    try { res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) }); }
    catch (e) { problems.push(['UNREACHABLE', file, e.cause?.code || e.message]); return; }
    checked++;
    if (res.status !== 200) { problems.push(['MISSING', file, 'HTTP ' + res.status]); return; }
    const served = normalize(await res.arrayBuffer());
    if (served !== normalize(git('show', `${rev}:${file}`))) problems.push(['STALE', file, 'differs from ' + rev]);
}));

// Scripts referenced by pages but absent from the revision (cannot be fixed by uploading).
const referenced = new Set();
for (const page of files.filter(f => f.endsWith('.html'))) {
    for (const m of git('show', `${rev}:${page}`).toString().matchAll(/<script[^>]+src="([^":]+)"/g)) referenced.add(m[1]);
}
const notInRepo = [...referenced].filter(src => !files.includes(src)).sort();

problems.sort((a, b) => a[1].localeCompare(b[1]));
for (const [kind, file, why] of problems) console.log(`${kind.padEnd(11)} ${file}  (${why})`);
if (notInRepo.length) console.log(`\nNote: referenced by pages but not in ${rev} (optional modules): ${notInRepo.join(', ')}`);
console.log(`\n${checked}/${files.length} files fetched from ${base}; ${problems.length} problem(s).`);
if (problems.some(p => p[1] === 'auth-page.js' || p[1] === 'auth-config.js' || p[1] === 'central-auth.js'))
    console.log('CRITICAL: auth-page.js / auth-config.js / central-auth.js must be deployed together with the HTML pages.');
process.exit(problems.length ? 1 : 0);
