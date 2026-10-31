import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { db } from '../db/client.js';
import { notFound, ApiError } from '../lib/errors.js';
import type { BookContent, LibraryBook, ContentUpdate } from '@wisper-lib/shared-types';

export type Queryable = Pick<PoolClient,'query'>;
export function camel<T=Record<string,unknown>>(row: Record<string,unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_m,char:string)=>char.toUpperCase()),value instanceof Date ? value.toISOString() : value])) as T;
}
export const bookSelect=`SELECT b.*,s.name AS shelf_name,
  COALESCE(r.status,'unread') AS status, COALESCE(r.manual_progress,0)::float AS progress,
  r.last_location, (SELECT count(*)::int FROM chapters c WHERE c.book_id=b.id) AS chapter_count
  FROM books b LEFT JOIN shelves s ON s.id=b.shelf_id AND s.owner_id=b.owner_id
  LEFT JOIN LATERAL (SELECT status,manual_progress,last_location FROM reading_records
    WHERE book_id=b.id AND owner_id=b.owner_id ORDER BY created_at DESC,id DESC LIMIT 1) r ON true`;

export async function getBook(owner:string,id:string,connection:Queryable=db):Promise<LibraryBook> {
  const result=await connection.query(`${bookSelect} WHERE b.owner_id=$1 AND b.id=$2`,[owner,id]);
  if (!result.rows[0]) throw notFound('Book');
  const book=camel<LibraryBook>(result.rows[0]);
  book.coverPath=book.coverPath ? `/api/v1/books/${book.id}/cover` : null;
  book.filePath=book.filePath ? `/api/v1/books/${book.id}/file` : null;
  return book;
}
export async function ensureShelf(owner:string,id:string|null|undefined,connection:Queryable=db):Promise<void> {
  if (id && !(await connection.query('SELECT id FROM shelves WHERE id=$1 AND owner_id=$2',[id,owner])).rowCount) throw notFound('Shelf');
}
export async function getContent(owner:string,id:string,connection:Queryable=db):Promise<BookContent> {
  const book=await connection.query('SELECT content_revision,license_text FROM books WHERE id=$1 AND owner_id=$2',[id,owner]);
  if (!book.rows[0]) throw notFound('Book');
  const chapters=await connection.query('SELECT id,book_id,title,body,position,kind FROM chapters WHERE book_id=$1 AND owner_id=$2 ORDER BY position,id',[id,owner]);
  const references=await connection.query('SELECT id,book_id,label,author,url,locator,notes FROM book_references WHERE book_id=$1 AND owner_id=$2 ORDER BY position,id',[id,owner]);
  return {chapters:chapters.rows.map(row=>camel(row)),references:references.rows.map(row=>camel(row)),revision:book.rows[0].content_revision,licenseText:book.rows[0].license_text};
}

/** Replace an original manuscript transactionally without accepting another book's IDs. */
export async function saveContent(owner:string,id:string,input:ContentUpdate):Promise<BookContent> {
  const connection=await db.connect();
  try {
    await connection.query('BEGIN');
    const result=await connection.query('SELECT is_original,content_revision FROM books WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,owner]);
    if (!result.rows[0]) throw notFound('Book');
    if (!result.rows[0].is_original) throw new ApiError(403,'READ_ONLY_BOOK','Imported and demo books are read-only. Create an original book to write.');
    if (result.rows[0].content_revision!==input.revision) throw new ApiError(409,'REVISION_CONFLICT','This manuscript changed elsewhere. Reload or recover your draft before saving.');
    const chapterIds=input.chapters.map(chapter=>chapter.id ?? randomUUID());
    const referenceIds=input.references.map(reference=>reference.id ?? randomUUID());
    if (new Set(chapterIds).size!==chapterIds.length || new Set(referenceIds).size!==referenceIds.length) throw new ApiError(422,'DUPLICATE_ID','Chapter and reference IDs must be unique.');
    const collisions=await connection.query(`SELECT id FROM chapters WHERE id=ANY($1::uuid[]) AND (book_id<>$2 OR owner_id<>$3)
      UNION ALL SELECT id FROM book_references WHERE id=ANY($4::uuid[]) AND (book_id<>$2 OR owner_id<>$3)`,[chapterIds,id,owner,referenceIds]);
    if (collisions.rowCount) throw new ApiError(422,'INVALID_ID','A chapter or reference belongs to another book.');
    await connection.query('DELETE FROM chapters WHERE book_id=$1 AND owner_id=$2 AND NOT(id=ANY($3::uuid[]))',[id,owner,chapterIds]);
    await connection.query('DELETE FROM book_references WHERE book_id=$1 AND owner_id=$2 AND NOT(id=ANY($3::uuid[]))',[id,owner,referenceIds]);
    for (const [position,chapter] of input.chapters.entries()) await connection.query(`INSERT INTO chapters(id,book_id,owner_id,title,body,position,kind) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body,position=EXCLUDED.position,kind=EXCLUDED.kind`,[chapterIds[position],id,owner,chapter.title,chapter.body,position,chapter.kind]);
    for (const [position,reference] of input.references.entries()) await connection.query(`INSERT INTO book_references(id,book_id,owner_id,label,author,url,locator,notes,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,author=EXCLUDED.author,url=EXCLUDED.url,locator=EXCLUDED.locator,notes=EXCLUDED.notes,position=EXCLUDED.position`,[referenceIds[position],id,owner,reference.label,reference.author,reference.url,reference.locator,reference.notes,position]);
    await connection.query('UPDATE books SET content_revision=content_revision+1,updated_at=now() WHERE id=$1 AND owner_id=$2',[id,owner]);
    const content=await getContent(owner,id,connection);
    await connection.query('COMMIT');
    return content;
  } catch(error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
}
