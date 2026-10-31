import assert from 'node:assert/strict';
import { readingPages, locatePage, parseLocation, describeLocation } from '../src/reader/reading.ts';

const makeChapter = (id, body, title = 'A chapter') => ({ id, bookId: 'book', title, body, position: 0, kind: 'body' });
const text = ('A paragraph about reliable systems and careful reading. '.repeat(13) + '\r\n\r\n').repeat(8);
const pages = readingPages([makeChapter('one', text)], 600);
assert.ok(pages.length > 1);
assert.equal(pages.map(page => page.text).join(''), text.replace(/\r\n/g, '\n'));
for (let index = 0; index < pages.length; index++) {
  const page = pages[index];
  assert.equal(page.page, index);
  assert.equal(page.offset, pages.slice(0, index).reduce((sum, previous) => sum + previous.text.length, 0));
  assert.equal(locatePage(pages, parseLocation(JSON.stringify({ chapterId: page.chapterId, page: page.page, offset: page.offset }))), index);
}
assert.equal(readingPages([makeChapter('empty', '')]).length, 1);
assert.deepEqual(readingPages([]), []);
assert.throws(() => readingPages([], 0), RangeError);
for (const invalid of ['', 'no-json', 'null', '[]', '{"chapterId":"one","page":-1}', '{"chapterId":"one","page":1.5}', '{"chapterId":"","page":0}']) assert.equal(parseLocation(invalid), null);
assert.equal(locatePage(pages, { chapterId: 'missing', page: 900, offset: 0 }), 0);
assert.equal(locatePage(pages, { chapterId: 'one', page: 900, offset: pages[2].offset }), 2);
assert.equal(describeLocation(JSON.stringify({ chapterId: 'one', page: 2, offset: 0, chapterTitle: 'Concurrency' })), 'Concurrency · Reading page 3');
assert.equal(describeLocation(JSON.stringify({ chapterId: 'one', page: 0, offset: 0, chapterTitle: 'Page 12' })), 'Page 12');
const emojiPages = readingPages([makeChapter('unicode', 'a'.repeat(599) + '🕯️'.repeat(700))], 600);
assert.equal(emojiPages.map(page => page.text).join(''), 'a'.repeat(599) + '🕯️'.repeat(700));
for (const page of emojiPages) {
  assert.ok(!/[\uD800-\uDBFF]$/.test(page.text), 'A page does not end inside a surrogate pair');
  assert.ok(!/^[\uDC00-\uDFFF]/.test(page.text), 'A page does not begin inside a surrogate pair');
}
console.log('Reading checks passed: stable pages, exact text reconstruction, location recovery, validation, and Unicode boundaries.');
