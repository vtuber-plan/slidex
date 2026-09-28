import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseSlideX} from '../dist/ir.js';
import {serializeDeck} from '../dist/serializer.js';
import {createDocument} from '../dist/file-commands.js';
import {startServer} from '../dist/server.js';

const source = '<deck version="1" title="Metadata"><slide id="one"/></deck>';
const parsed = parseSlideX('<deck version="1"><metadata author="A &amp; B" created-at="2024-01-02T03:04:05.000Z" modified-by="C" modified-at="2024-02-03T04:05:06.000Z" last-machine="desktop"/><slide id="one"/></deck>');
assert.equal(parsed.errors.length, 0);
assert.equal(parsed.warnings.length, 0);
assert.deepEqual(parseSlideX(serializeDeck(parsed.deck)).deck.metadata, parsed.deck.metadata);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slidex-metadata-'));
try {
  const file = path.join(dir, 'deck.slx');
  fs.writeFileSync(file, source);
  const copy = createDocument(path.join(dir, 'copy.slx'), file, serializeDeck(parsed.deck));
  const copyMetadata = parseSlideX(fs.readFileSync(copy, 'utf8')).deck.metadata;
  assert.equal(copyMetadata.author, os.userInfo().username);
  assert.equal(copyMetadata.modifiedBy, copyMetadata.author);
  assert.equal(copyMetadata.lastMachine, os.hostname());
  assert.notEqual(copyMetadata.createdAt, parsed.deck.metadata.createdAt);

  const server = await startServer(file, {port: 0});
  try {
    const base = `http://127.0.0.1:${server.port}`;
    const save = async xml => {
      const response = await fetch(base + '/api/save', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({xml})});
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.ok, true, JSON.stringify(data));
      return data.metadata;
    };
    const first = await save(source);
    assert.equal(first.author, os.userInfo().username);
    assert.equal(first.modifiedBy, first.author);
    assert.equal(first.lastMachine, os.hostname());
    assert.equal(parseSlideX(fs.readFileSync(file, 'utf8')).deck.metadata.createdAt, first.createdAt);

    const edited = fs.readFileSync(file, 'utf8').replace('title="Metadata"', 'title="Edited"');
    const second = await save(edited);
    assert.equal(second.author, first.author);
    assert.equal(second.createdAt, first.createdAt);
    assert.equal(parseSlideX(fs.readFileSync(file, 'utf8')).deck.metadata.modifiedAt, second.modifiedAt);
  } finally { server.close(); }
} finally { fs.rmSync(dir, {recursive: true, force: true}); }
console.log('PASS metadata parsing, roundtrip, document creation, and editor save');
