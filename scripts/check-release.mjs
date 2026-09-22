import fs from 'node:fs';
import assert from 'node:assert/strict';
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')),lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
assert.equal(pkg.version,lock.version);assert.equal(pkg.version,lock.packages[''].version);
if(process.env.GITHUB_REF_TYPE==='tag')assert.equal(process.env.GITHUB_REF_NAME,'v'+pkg.version,'Release tag must match package version');
assert.ok(fs.existsSync('skills/slidex/SKILL.md'));
console.log('Release metadata OK:',pkg.version);
