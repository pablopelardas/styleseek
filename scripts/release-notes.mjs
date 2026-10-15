/**
 * Extracts one version's section from CHANGELOG.md.
 *
 * Release notes written twice drift. The changelog is the source of truth, so
 * the GitHub release just quotes it — and failing loudly when the section is
 * missing is the point: a release with no notes is a release nobody can read.
 */
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version>');
  process.exit(1);
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const lines = changelog.split('\n');
const heading = `## ${version}`;
const start = lines.findIndex((line) => line.trim() === heading);

if (start === -1) {
  console.error(`CHANGELOG.md has no "${heading}" section. Add one before tagging.`);
  process.exit(1);
}

const rest = lines.slice(start + 1);
const end = rest.findIndex((line) => line.startsWith('## '));
const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();

if (!body) {
  console.error(`The "${heading}" section is empty. Describe the release before tagging.`);
  process.exit(1);
}

process.stdout.write(`${body}\n`);
