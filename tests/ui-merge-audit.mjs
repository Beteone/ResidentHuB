// Read-only inventory of UI wiring around the two merges under investigation.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const revisions = ['4475c45^1', '4475c45^2', '4475c45', '419541d^1', '419541d', 'HEAD'];
for (const file of ['dashboard.html', 'resident-web.html']) {
    console.log('\nPAGE', file);
    for (const revision of revisions) {
        const source = execFileSync('git', ['show', `${revision}:${file}`], { encoding: 'utf8' });
        console.log(revision, JSON.stringify({
            scripts: [...source.matchAll(/<script[^>]*src=["']([^"']+)/g)].map(m => m[1]).filter(s => !s.startsWith('http')),
            tabs: [...source.matchAll(/id=["']([^"']+-tab)["']/g)].map(m => m[1])
        }));
    }
}
// Isolate the two missing CRUD integrations using stubs, without modifying data.
for (const revision of ['b521367', 'b04eae6', '6fe440f', '4475c45^1', '4475c45^2', '4475c45', 'HEAD']) {
    const storage = new Map();
    let meterCalls = 0, contractCalls = 0;
    const sandbox = { console, Date, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) } };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(execFileSync('git', ['show', `${revision}:data.js`], { encoding: 'utf8' }), sandbox);
    sandbox.RHB = { meterChanged() { meterCalls++; } };
    sandbox.RHDocuments = { prepare() { contractCalls++; return { ok: false, error: 'audit-validator' }; } };
    const reading = sandbox.RHD.create('meters', { apartmentId: 'audit', readingPeriod: '2026-10' });
    sandbox.RHD.update('meters', reading.item.id, { latestIndex: 20 });
    sandbox.RHD.remove('meters', reading.item.id);
    const contract = sandbox.RHD.create('contracts', {});
    console.log('HISTORICAL CRUD PROBE', revision, JSON.stringify({ meterCalls, contractCalls, rejectedContract: !contract.ok }));
}
const old = execFileSync('git', ['show', 'eba223b:manager-modules.js'], { encoding: 'utf8' });
const current = readFileSync('manager-modules.js', 'utf8');
const functions = source => [...source.matchAll(/(?:function\s+(\w+)\s*\(|RHUI\.(\w+)\s*=\s*function)/g)].map(m => m[1] || m[2]);
console.log('\nREMOVED FUNCTIONS', JSON.stringify(functions(old).filter(name => !functions(current).includes(name))));
for (const file of ['resident-web.html', 'dashboard.html', 'data.js', 'auth.js']) {
    const before = execFileSync('git', ['show', `4475c45^1:${file}`], { encoding: 'utf8' });
    const after = readFileSync(file, 'utf8');
    const names = source => [...source.matchAll(/function\s+(\w+)\s*\(/g)].map(m => m[1]);
    console.log('REMOVED FROM FIRST PARENT', file, JSON.stringify(names(before).filter(name => !names(after).includes(name))));
}
