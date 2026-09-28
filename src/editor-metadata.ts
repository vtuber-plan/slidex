import os from 'node:os';
import type { Deck, DeckMetadata } from './types.js';

/** The editor owns provenance on disk. XML parsing and CLI formatting leave it alone. */
export function stampEditorMetadata(deck: Deck, previous?: DeckMetadata): DeckMetadata {
  let user = '';
  try { user = os.userInfo().username; } catch { /* unavailable in some runtimes */ }
  const actor = user || process.env.USERNAME || process.env.USER || 'unknown';
  const now = new Date().toISOString();
  const metadata: DeckMetadata = {
    author: previous?.author || actor,
    createdAt: previous?.createdAt || now,
    modifiedBy: actor,
    modifiedAt: now,
    lastMachine: os.hostname() || 'unknown',
  };
  deck.metadata = metadata;
  return metadata;
}
