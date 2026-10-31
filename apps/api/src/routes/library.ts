import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  LibraryBookInputSchema, LibraryBookUpdateSchema, ContentUpdateSchema, ShelfInputSchema,
  PageNoteInputSchema, PageNoteUpdateSchema, ReviewInputSchema, ProgressInputSchema,
  LanguageSchema, type LibraryBook, type PageNote, type PersonalReview,
} from '@wisper-lib/shared-types';
import { db } from '../db/client.js';
import { config } from '../lib/config.js';
import { ApiError, notFound } from '../lib/errors.js';
import { decodeCursor, paginateResults } from '../lib/pagination.js';
import { camel, bookSelect, getBook, getContent, ensureShelf, saveContent } from '../library/store.js';
import { exportEpub } from '../library/import.js';
import { parseImport } from '../library/import-service.js';
import { speechLanguages, selectPreview, synthesize } from '../library/speech.js';
import { demoBooks } from '../data/demo-books.js';

const paramsSchema=z.object({id:z.string().uuid()});
const pageSchema=z.object({after:z.string().max(1000).optional(),limit:z.coerce.number().int().min(1).max(100).default(30)});
const bookQuery=pageSchema.extend({q:z.string().max(200).optional(),shelfId:z.string().uuid().optional(),wishlist:z.enum(['true','false']).optional(),status:z.enum(['unread','reading','paused','finished','dnf']).optional()});
const noteQuery=pageSchema.extend({bookId:z.string().uuid().optional(),chapterId:z.string().uuid().optional(),location:z.string().max(2000).optional(),q:z.string().max(200).optional(),tag:z.string().max(100).optional()});
const id=(request:FastifyRequest)=>paramsSchema.parse(request.params).id;
const noteSelect=`SELECT n.*,b.title AS book_title FROM notes n LEFT JOIN books b ON b.id=n.book_id AND b.owner_id=n.owner_id`;
const reviewSelect=`SELECT r.*,b.title AS book_title,b.author FROM reviews r LEFT JOIN books b ON b.id=r.book_id AND b.owner_id=r.owner_id`;
const filePath=(filename:string)=>{
  if (path.basename(filename)!==filename) throw notFound('File');
  return path.join(config.uploadsDir,filename);
};
function cursor(raw:string|undefined,alias:string,values:unknown[]):string {
  if (!raw) return '';
  const parsed=decodeCursor(raw);
  if (!parsed || !z.string().uuid().safeParse(parsed.id).success || !Number.isFinite(Date.parse(parsed.createdAt))) throw new ApiError(422,'INVALID_CURSOR','Pagination cursor is invalid.');
  values.push(parsed.createdAt,parsed.id);
  return ` AND (${alias}.created_at,${alias}.id)<($${values.length-1}::timestamptz,$${values.length}::uuid)`;
}
function page<T extends {id:string;createdAt:string}>(rows:T[],limit:number) {
  const result=paginateResults(rows,limit);
  return {data:result.items,meta:{nextCursor:result.nextCursor,hasMore:!!result.nextCursor,limit}};
}
async function ownedNote(owner:string,noteId:string):Promise<PageNote> {
  const result=await db.query(`${noteSelect} WHERE n.owner_id=$1 AND n.id=$2`,[owner,noteId]);
  if (!result.rows[0]) throw notFound('Note');
  return camel(result.rows[0]);
}
async function noteReferences(owner:string,bookId:string|null|undefined,chapterId:string|null|undefined) {
  if (bookId) await getBook(owner,bookId);
  if (chapterId) {
    const chapter=await db.query('SELECT book_id FROM chapters WHERE id=$1 AND owner_id=$2',[chapterId,owner]);
    if (!chapter.rows[0] || chapter.rows[0].book_id!==bookId) throw new ApiError(422,'INVALID_CHAPTER','The selected page must belong to this book.');
  }
}
async function multipartData(request:FastifyRequest) {
  let file:Buffer|undefined; let filename=''; let mimetype='';
  const fields:Record<string,string>={};
  for await (const part of request.parts()) {
    if (part.type==='file') { filename=part.filename; mimetype=part.mimetype; file=await part.toBuffer(); }
    else if (typeof part.value==='string') fields[part.fieldname]=part.value;
  }
  if (!file || !file.length) throw new ApiError(422,'MISSING_FILE','Choose a nonempty file to upload.');
  return {file,filename,mimetype,fields};
}
function attachment(title:string,extension:string):string {
  const filename=title.replace(/[\r\n\/\\]/g,' ').slice(0,120)+extension;
  return `attachment; filename="book${extension}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Product API: records and file access are always scoped to request.user.id. */
export async function libraryRoutes(app:FastifyInstance):Promise<void> {
  app.get('/speech/languages',async()=>({data:speechLanguages}));
  app.get('/books',async request=>{
    const query=bookQuery.parse(request.query); const values:unknown[]=[request.user.id];
    let where=' WHERE b.owner_id=$1';
    if (query.q) { values.push(`%${query.q}%`); where+=` AND (b.title ILIKE $${values.length} OR b.author ILIKE $${values.length})`; }
    if (query.shelfId) { values.push(query.shelfId); where+=` AND b.shelf_id=$${values.length}`; }
    if (query.wishlist) { values.push(query.wishlist==='true'); where+=` AND b.is_wishlist=$${values.length}`; }
    if (query.status) { values.push(query.status); where+=` AND COALESCE(r.status,'unread')=$${values.length}`; }
    where+=cursor(query.after,'b',values); values.push(query.limit+1);
    const result=await db.query(`${bookSelect}${where} ORDER BY b.created_at DESC,b.id DESC LIMIT $${values.length}`,values);
    const rows=result.rows.map(row=>{
      const book=camel<LibraryBook>(row);
      book.coverPath=book.coverPath ? `/api/v1/books/${book.id}/cover`:null;
      book.filePath=book.filePath ? `/api/v1/books/${book.id}/file`:null;
      return book;
    });
    return page(rows,query.limit);
  });
  app.post('/books',async(request,reply)=>{
    const input=LibraryBookInputSchema.parse(request.body); const owner=request.user.id;
    await ensureShelf(owner,input.shelfId);
    const result=await db.query(`INSERT INTO books(owner_id,title,author,description,language,tags,shelf_id,accent,is_original,is_wishlist,format,import_state) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,'manual','ready') RETURNING id`,[owner,input.title,input.author||null,input.description,input.language,JSON.stringify(input.tags),input.shelfId,input.accent,input.isOriginal,input.isWishlist]);
    return reply.status(201).send({data:await getBook(owner,result.rows[0].id)});
  });
  app.post('/books/upload',async(request,reply)=>{
    const upload=await multipartData(request);
    const imported=await parseImport(upload.file,upload.filename);
    const input=LibraryBookInputSchema.parse({title:upload.fields.title||imported.title,author:upload.fields.author||imported.author,language:upload.fields.language||'en-US',description:upload.fields.description||'',shelfId:upload.fields.shelfId||null,accent:upload.fields.accent||'#B58A67'});
    const owner=request.user.id; await ensureShelf(owner,input.shelfId);
    const connection=await db.connect(); const filename=`book-${randomUUID()}${path.extname(upload.filename).toLowerCase()}`;
    let written=false;
    try {
      await connection.query('BEGIN');
      const result=await connection.query(`INSERT INTO books(owner_id,title,author,description,language,tags,shelf_id,accent,format,import_state,file_path) VALUES($1,$2,$3,$4,$5,'[]',$6,$7,$8,'ready',$9) RETURNING id`,[owner,input.title,input.author||null,input.description,input.language,input.shelfId,input.accent,imported.format,filename]);
      const bookId=result.rows[0].id;
      for (const [position,chapter] of imported.chapters.entries()) await connection.query('INSERT INTO chapters(book_id,owner_id,title,body,position,kind) VALUES($1,$2,$3,$4,$5,$6)',[bookId,owner,chapter.title,chapter.body,position,chapter.kind]);
      await writeFile(filePath(filename),upload.file,{flag:'wx'}); written=true;
      await connection.query('COMMIT');
      return reply.status(201).send({data:await getBook(owner,bookId)});
    } catch(error) { await connection.query('ROLLBACK'); if (written) await unlink(filePath(filename)).catch(()=>{}); throw error; }
    finally { connection.release(); }
  });
  app.post('/demo/import',async(request,reply)=>{
    const connection=await db.connect(); const owner=request.user.id; const imported:string[]=[];
    try {
      await connection.query('BEGIN');
      const colors=['#C8734D','#A090B4','#6A9C97'];
      for (const [index,book] of demoBooks.entries()) {
        const result=await connection.query(`INSERT INTO books(owner_id,title,author,description,format,import_state,source_url,license,license_text,demo_slug,accent) VALUES($1,$2,$3,$4,'manual','ready',$5,$6,$7,$8,$9) ON CONFLICT(owner_id,demo_slug) WHERE demo_slug IS NOT NULL DO NOTHING RETURNING id`,[owner,book.title,book.author,book.description,book.sourceUrl,book.license,book.licenseText,book.slug,colors[index%colors.length]]);
        if (!result.rows[0]) continue;
        const bookId=result.rows[0].id;
        for (const [position,chapter] of book.chapters.entries()) await connection.query('INSERT INTO chapters(book_id,owner_id,title,body,position,kind) VALUES($1,$2,$3,$4,$5,$6)',[bookId,owner,chapter.title,chapter.body,position,chapter.kind]);
        imported.push(bookId);
      }
      await connection.query('COMMIT');
      return reply.status(201).send({data:{imported:imported.length,bookIds:imported}});
    } catch(error) { await connection.query('ROLLBACK'); throw error; } finally { connection.release(); }
  });
  app.get('/books/:id',async request=>({data:await getBook(request.user.id,id(request))}));
  app.patch('/books/:id',async request=>{
    const bookId=id(request),owner=request.user.id; await getBook(owner,bookId);
    const input=LibraryBookUpdateSchema.parse(request.body); await ensureShelf(owner,input.shelfId);
    const mappings:Record<string,string>={title:'title',author:'author',description:'description',language:'language',tags:'tags',shelfId:'shelf_id',accent:'accent',isWishlist:'is_wishlist'};
    const sets:string[]=[]; const values:unknown[]=[owner,bookId];
    for (const [key,column] of Object.entries(mappings)) if (key in input) { const value=input[key as keyof typeof input]; values.push(key==='tags'?JSON.stringify(value):value); sets.push(`${column}=$${values.length}${key==='tags'?'::jsonb':''}`); }
    if (sets.length) await db.query(`UPDATE books SET ${sets.join(',')},updated_at=now() WHERE owner_id=$1 AND id=$2`,values);
    return {data:await getBook(owner,bookId)};
  });
  app.delete('/books/:id',async(request,reply)=>{
    const result=await db.query('DELETE FROM books WHERE id=$1 AND owner_id=$2 RETURNING file_path,cover_path',[id(request),request.user.id]);
    if (!result.rows[0]) throw notFound('Book');
    for (const value of Object.values(result.rows[0])) if (typeof value==='string') await unlink(filePath(value)).catch(()=>{});
    return reply.status(204).send();
  });
  app.get('/books/:id/content',async request=>({data:await getContent(request.user.id,id(request))}));
  app.put('/books/:id/content',{bodyLimit:4*1024*1024},async request=>({data:await saveContent(request.user.id,id(request),ContentUpdateSchema.parse(request.body))}));
  app.post('/books/:id/progress',async request=>{
    const owner=request.user.id,bookId=id(request),input=ProgressInputSchema.parse(request.body);
    const connection=await db.connect();
    try {
      await connection.query('BEGIN');
      const owned=await connection.query('SELECT id FROM books WHERE id=$1 AND owner_id=$2 FOR UPDATE',[bookId,owner]); if (!owned.rowCount) throw notFound('Book');
      const current=await connection.query('SELECT id FROM reading_records WHERE book_id=$1 AND owner_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[bookId,owner]);
      if (current.rows[0]) await connection.query(`UPDATE reading_records SET status=$1,last_location=$2,manual_progress=$3,revision=revision+1,finished_at=CASE WHEN $1='finished' THEN COALESCE(finished_at,now()) ELSE NULL END WHERE id=$4 AND owner_id=$5`,[input.status,input.lastLocation,input.progress,current.rows[0].id,owner]);
      else await connection.query(`INSERT INTO reading_records(book_id,owner_id,status,last_location,manual_progress,started_at,finished_at) VALUES($1,$2,$3,$4,$5,now(),CASE WHEN $3='finished' THEN now() END)`,[bookId,owner,input.status,input.lastLocation,input.progress]);
      await connection.query('COMMIT');
      return {data:await getBook(owner,bookId)};
    } catch(error) { await connection.query('ROLLBACK'); throw error; } finally {connection.release();}
  });
  app.post('/books/:id/cover',async request=>{
    const owner=request.user.id,bookId=id(request); await getBook(owner,bookId);
    const {file}=await multipartData(request);
    if (file.length>5*1024*1024) throw new ApiError(413,'COVER_TOO_LARGE','Cover images must be at most 5 MB.');
    let ext='';
    if (file.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ext='.png';
    else if (file[0]===255&&file[1]===216&&file[2]===255) ext='.jpg';
    else if (file.subarray(0,4).toString()==='RIFF' && file.subarray(8,12).toString()==='WEBP') ext='.webp';
    if (!ext) throw new ApiError(422,'INVALID_COVER','Use a PNG, JPEG, or WebP cover image.');
    const filename=`cover-${randomUUID()}${ext}`;
    await writeFile(filePath(filename),file,{flag:'wx'});
    try {
      const previous=await db.query(`WITH prior AS (SELECT id,cover_path FROM books WHERE id=$1 AND owner_id=$2 FOR UPDATE)
        UPDATE books b SET cover_path=$3,updated_at=now() FROM prior WHERE b.id=prior.id RETURNING prior.cover_path`,[bookId,owner,filename]);
      if (!previous.rowCount) throw notFound('Book');
      if (previous.rows[0].cover_path) await unlink(filePath(previous.rows[0].cover_path)).catch(()=>{});
    } catch(error) { await unlink(filePath(filename)).catch(()=>{});throw error; }
    return {data:await getBook(owner,bookId)};
  });
  app.delete('/books/:id/cover',async(request,reply)=>{
    const result=await db.query(`WITH prior AS (SELECT id,cover_path FROM books WHERE id=$1 AND owner_id=$2 FOR UPDATE)
      UPDATE books b SET cover_path=NULL,updated_at=now() FROM prior WHERE b.id=prior.id RETURNING prior.cover_path`,[id(request),request.user.id]);
    if (!result.rowCount) throw notFound('Book');
    if (result.rows[0].cover_path) await unlink(filePath(result.rows[0].cover_path)).catch(()=>{});
    return reply.status(204).send();
  });
  app.get('/books/:id/cover',async(request,reply)=>{
    const result=await db.query('SELECT cover_path FROM books WHERE id=$1 AND owner_id=$2',[id(request),request.user.id]);
    const filename=result.rows[0]?.cover_path; if (!filename) throw notFound('Cover');
    try {await access(filePath(filename));} catch {throw notFound('Cover');}
    const type=filename.endsWith('.png')?'image/png':filename.endsWith('.webp')?'image/webp':'image/jpeg';
    return reply.header('Cache-Control','private, max-age=300').type(type).send(createReadStream(filePath(filename)));
  });
  app.get('/books/:id/file',async(request,reply)=>{
    const bookId=id(request); const owner=request.user.id;
    const result=await db.query('SELECT file_path,title,format FROM books WHERE id=$1 AND owner_id=$2',[bookId,owner]);
    const book=result.rows[0]; if (!book?.file_path) throw notFound('Book file');
    try { await access(filePath(book.file_path)); } catch { throw notFound('Book file'); }
    const type=book.format==='pdf'?'application/pdf':book.format==='epub'?'application/epub+zip':'text/plain; charset=utf-8';
    return reply.header('Cache-Control','private, no-store').header('Content-Disposition',book.format==='pdf'?'inline':attachment(book.title,path.extname(book.file_path))).type(type).send(createReadStream(filePath(book.file_path)));
  });
  app.get('/books/:id/export',async(request,reply)=>{
    const book=await getBook(request.user.id,id(request)); const content=await getContent(request.user.id,book.id);
    const query=z.object({format:z.enum(['markdown','epub']).default('markdown')}).parse(request.query);
    const refs=content.references.map((reference,index)=>`[${index+1}] ${reference.label}${reference.author?' — '+reference.author:''}${reference.locator?' ('+reference.locator+')':''}${reference.url?'\n'+reference.url:''}${reference.notes?'\n'+reference.notes:''}`).join('\n\n');
    const backmatter=[refs,book.sourceUrl?'Source: '+book.sourceUrl:'',content.licenseText??''].filter(Boolean).join('\n\n');
    if (query.format==='epub') return reply.type('application/epub+zip').header('Content-Disposition',attachment(book.title,'.epub')).send(exportEpub(book,content.chapters,backmatter));
    const markdown=`# ${book.title}\n\n${book.author||''}\n\n${content.chapters.map(chapter=>`## ${chapter.title}\n\n${chapter.body}`).join('\n\n')}\n\n${backmatter?'## References and license\n\n'+backmatter:''}\n`;
    return reply.type('text/markdown; charset=utf-8').header('Content-Disposition',attachment(book.title,'.md')).send(markdown);
  });
  app.get('/books/:id/preview',async request=>{
    const book=await getBook(request.user.id,id(request)); const query=z.object({language:LanguageSchema.optional()}).parse(request.query);
    return {data:selectPreview(book,await getContent(request.user.id,book.id),query.language||book.language)};
  });
  app.post('/books/:id/whisper',async request=>{
    const body=z.object({language:LanguageSchema.optional(),consent:z.literal(true),transcript:z.string().max(650).optional()}).parse(request.body);
    const book=await getBook(request.user.id,id(request));
    const preview=selectPreview(book,await getContent(request.user.id,book.id),body.language||book.language);
    if (body.transcript !== undefined && body.transcript !== preview.transcript) throw new ApiError(409,'PREVIEW_CHANGED','This preview changed. Refresh the transcript before listening.');
    return {data:await synthesize(request.user.id,book.id,preview)};
  });
  app.get('/whispers/:id/audio',async(request,reply)=>{
    const row=(await db.query("SELECT audio_path FROM whisper_assets WHERE id=$1 AND owner_id=$2 AND state='ready'",[id(request),request.user.id])).rows[0];
    if (!row?.audio_path) throw notFound('Audio');
    try {await access(filePath(row.audio_path));} catch {throw notFound('Audio');}
    return reply.type('audio/mpeg').header('Cache-Control','private, max-age=300').send(createReadStream(filePath(row.audio_path)));
  });
  app.get('/shelves',async request=>{
    const rows=await db.query('SELECT s.*,count(b.id)::int AS book_count FROM shelves s LEFT JOIN books b ON b.shelf_id=s.id AND b.owner_id=s.owner_id WHERE s.owner_id=$1 GROUP BY s.id ORDER BY s.sort_order,s.created_at,s.id',[request.user.id]);
    return {data:rows.rows.map(row=>camel(row))};
  });
  app.post('/shelves',async(request,reply)=>{
    const input=ShelfInputSchema.parse(request.body);
    try {const row=await db.query('INSERT INTO shelves(owner_id,name,description,color,layout,sort_order) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[request.user.id,input.name,input.description,input.color,input.layout,input.sortOrder]);return reply.status(201).send({data:{...camel(row.rows[0]),bookCount:0}});}
    catch(error) {if ((error as {code?:string}).code==='23505') throw new ApiError(409,'SHELF_EXISTS','A shelf with this name already exists.');throw error;}
  });
  app.patch('/shelves/:id',async request=>{
    const current=(await db.query('SELECT * FROM shelves WHERE id=$1 AND owner_id=$2',[id(request),request.user.id])).rows[0];
    if (!current) throw notFound('Shelf');
    const input=ShelfInputSchema.parse({...camel<Record<string,unknown>>(current),...ShelfInputSchema.partial().parse(request.body)});
    try {const row=await db.query('UPDATE shelves SET name=$1,description=$2,color=$3,layout=$4,sort_order=$5 WHERE id=$6 AND owner_id=$7 RETURNING *',[input.name,input.description,input.color,input.layout,input.sortOrder,id(request),request.user.id]);return {data:camel(row.rows[0])};}
    catch(error) {if((error as {code?:string}).code==='23505') throw new ApiError(409,'SHELF_EXISTS','A shelf with this name already exists.');throw error;}
  });
  app.put('/shelves/order',async(request)=>{
    const {ids}=z.object({ids:z.array(z.string().uuid()).max(200)}).parse(request.body);
    if (new Set(ids).size !== ids.length) throw new ApiError(422,'INVALID_ORDER','A collection can appear only once in the order.');
    const connection=await db.connect();
    try {
      await connection.query('BEGIN');
      const owned=await connection.query('SELECT id FROM shelves WHERE owner_id=$1 ORDER BY sort_order,created_at,id FOR UPDATE',[request.user.id]);
      if (owned.rows.length !== ids.length || owned.rows.some(row=>!ids.includes(row.id))) throw new ApiError(409,'COLLECTIONS_CHANGED','Refresh your collections before changing their order.');
      await connection.query(`UPDATE shelves AS shelf SET sort_order=ordered.position-1 FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered(id,position) WHERE shelf.owner_id=$1 AND shelf.id=ordered.id`,[request.user.id,ids]);
      await connection.query('COMMIT');
      return {data:{ids}};
    } catch(error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
  });
  app.delete('/shelves/:id',async(request,reply)=>{
    const result=await db.query('DELETE FROM shelves WHERE id=$1 AND owner_id=$2',[id(request),request.user.id]);
    if (!result.rowCount) throw notFound('Shelf'); return reply.status(204).send();
  });
  app.get('/notes/export',async(request,reply)=>{
    const query=z.object({format:z.enum(['json','markdown']).default('json'),bookId:z.string().uuid().optional()}).parse(request.query);
    const result=await db.query(`${noteSelect} WHERE n.owner_id=$1${query.bookId?' AND n.book_id=$2':''} ORDER BY n.created_at,n.id LIMIT 10001`,query.bookId?[request.user.id,query.bookId]:[request.user.id]);
    if (result.rows.length>10000) throw new ApiError(422,'EXPORT_LIMIT','Export one book at a time when the library has more than 10,000 notes.');
    const notes=result.rows.map(row=>camel<PageNote>(row));
    const text=query.format==='json'?JSON.stringify(notes,null,2):notes.map(note=>`## ${note.title||'Untitled note'}\n\n${note.bookTitle?'Book: '+note.bookTitle+'\n\n':''}${note.location?'Location: '+note.location+'\n\n':''}${note.selectedText?'> '+note.selectedText.replace(/\n/g,'\n> ')+'\n\n':''}${note.body}`).join('\n\n---\n\n');
    return reply.type(query.format==='json'?'application/json':'text/markdown').header('Content-Disposition',`attachment; filename="reading-notes.${query.format==='json'?'json':'md'}"`).send(text);
  });
  app.get('/notes',async request=>{
    const query=noteQuery.parse(request.query); const values:unknown[]=[request.user.id]; let where=' WHERE n.owner_id=$1';
    for (const [key,column] of [['bookId','book_id'],['chapterId','chapter_id'],['location','location']] as const) if (query[key]) {values.push(query[key]);where+=` AND n.${column}=$${values.length}`;}
    if (query.q) {values.push(query.q);where+=` AND to_tsvector('english',coalesce(n.title,'')||' '||n.body) @@ websearch_to_tsquery('english',$${values.length})`;}
    if (query.tag) {values.push(JSON.stringify([query.tag]));where+=` AND n.tags @> $${values.length}::jsonb`;}
    where+=cursor(query.after,'n',values);values.push(query.limit+1);
    const rows=await db.query(`${noteSelect}${where} ORDER BY n.created_at DESC,n.id DESC LIMIT $${values.length}`,values);
    return page(rows.rows.map(row=>camel<PageNote>(row)),query.limit);
  });
  app.get('/notes/:id',async request=>({data:await ownedNote(request.user.id,id(request))}));
  app.post('/notes',async(request,reply)=>{
    const input=PageNoteInputSchema.parse(request.body),owner=request.user.id;
    await noteReferences(owner,input.bookId,input.chapterId);
    if (input.clientOperationId) {
      const existing=await db.query('SELECT id FROM notes WHERE owner_id=$1 AND client_op_id=$2',[owner,input.clientOperationId]);
      if (existing.rows[0]) return {data:await ownedNote(owner,existing.rows[0].id)};
    }
    try {
      const row=await db.query(`INSERT INTO notes(owner_id,book_id,chapter_id,location,selected_text,title,body,tags,client_op_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING id`,[owner,input.bookId??null,input.chapterId??null,input.location??null,input.selectedText,input.title,input.body,JSON.stringify(input.tags),input.clientOperationId??null]);
      return reply.status(201).send({data:await ownedNote(owner,row.rows[0].id)});
    } catch(error) {
      if ((error as {code?:string}).code==='23505' && input.clientOperationId) {const row=await db.query('SELECT id FROM notes WHERE owner_id=$1 AND client_op_id=$2',[owner,input.clientOperationId]);if(row.rows[0])return {data:await ownedNote(owner,row.rows[0].id)};}
      throw error;
    }
  });
  app.patch('/notes/:id',async request=>{
    const noteId=id(request),owner=request.user.id,input=PageNoteUpdateSchema.parse(request.body),current=await ownedNote(owner,noteId);
    const updated={...current,...input};await noteReferences(owner,updated.bookId,updated.chapterId);
    const result=await db.query('UPDATE notes SET book_id=$1,chapter_id=$2,location=$3,selected_text=$4,title=$5,body=$6,tags=$7::jsonb,revision=revision+1 WHERE id=$8 AND owner_id=$9 AND revision=$10 RETURNING id',[updated.bookId,updated.chapterId,updated.location,updated.selectedText,updated.title,updated.body,JSON.stringify(updated.tags),noteId,owner,input.revision]);
    if (!result.rowCount) throw new ApiError(409,'REVISION_CONFLICT','This note changed elsewhere. Your draft is preserved; compare it with the latest saved version.');
    return {data:await ownedNote(owner,noteId)};
  });
  app.delete('/notes/:id',async(request,reply)=>{
    const result=await db.query('DELETE FROM notes WHERE id=$1 AND owner_id=$2',[id(request),request.user.id]);if(!result.rowCount)throw notFound('Note');return reply.status(204).send();
  });
  app.get('/reviews',async request=>{
    const query=pageSchema.parse(request.query),values:unknown[]=[request.user.id]; const after=cursor(query.after,'r',values);values.push(query.limit+1);
    const rows=await db.query(`${reviewSelect} WHERE r.owner_id=$1${after} ORDER BY r.created_at DESC,r.id DESC LIMIT $${values.length}`,values);
    return page(rows.rows.map(row=>camel<PersonalReview>(row)),query.limit);
  });
  app.post('/reviews',async(request,reply)=>{
    const input=ReviewInputSchema.parse(request.body),owner=request.user.id;
    if(input.bookId)await getBook(owner,input.bookId);if(input.sourceNoteId)await ownedNote(owner,input.sourceNoteId);
    const result=await db.query('INSERT INTO reviews(owner_id,book_id,source_note_id,title,body,rating,theme,caption) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[owner,input.bookId,input.sourceNoteId,input.title,input.body,input.rating,input.theme,'caption' in input ? input.caption:'']);
    return reply.status(201).send({data:camel((await db.query(`${reviewSelect} WHERE r.id=$1 AND r.owner_id=$2`,[result.rows[0].id,owner])).rows[0])});
  });
  app.get('/reviews/:id',async request=>{
    const row=(await db.query(`${reviewSelect} WHERE r.id=$1 AND r.owner_id=$2`,[id(request),request.user.id])).rows[0];if(!row)throw notFound('Review');return {data:camel(row)};
  });
  app.patch('/reviews/:id',async request=>{
    const reviewId=id(request),owner=request.user.id;
    const current=(await db.query('SELECT * FROM reviews WHERE id=$1 AND owner_id=$2',[reviewId,owner])).rows[0];if(!current)throw notFound('Review');
    const input=ReviewInputSchema.parse({...camel<Record<string,unknown>>(current),...ReviewInputSchema.partial().parse(request.body)});
    if(input.bookId)await getBook(owner,input.bookId);if(input.sourceNoteId)await ownedNote(owner,input.sourceNoteId);
    await db.query('UPDATE reviews SET book_id=$1,source_note_id=$2,title=$3,body=$4,rating=$5,theme=$6,caption=$7 WHERE id=$8 AND owner_id=$9',[input.bookId,input.sourceNoteId,input.title,input.body,input.rating,input.theme,'caption' in input ? input.caption:'',reviewId,owner]);
    return {data:camel((await db.query(`${reviewSelect} WHERE r.id=$1 AND r.owner_id=$2`,[reviewId,owner])).rows[0])};
  });
  app.delete('/reviews/:id',async(request,reply)=>{
    const result=await db.query('DELETE FROM reviews WHERE id=$1 AND owner_id=$2',[id(request),request.user.id]);if(!result.rowCount)throw notFound('Review');return reply.status(204).send();
  });
}
