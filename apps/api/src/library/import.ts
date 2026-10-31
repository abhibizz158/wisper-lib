import path from 'node:path';
import yauzl from 'yauzl';
import { load } from 'cheerio';
import { zipSync, strToU8 } from 'fflate';
import { ApiError } from '../lib/errors.js';

export interface ImportedChapter { title: string; body: string; kind: 'body' | 'glossary' | 'frontmatter' }
export interface ImportedBook { title: string; author: string; format: 'manual' | 'epub' | 'pdf'; chapters: ImportedChapter[] }
const limit = 2_000_000;
const bad = (message: string) => new ApiError(422, 'INVALID_BOOK', message);

/** Read only bounded EPUB text entries; no archive paths are written to disk. */
export async function unzipText(buffer: Buffer): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) { reject(bad('This EPUB archive could not be opened.')); return; }
      const files = new Map<string,string>(); let entries = 0; let total = 0; let settled = false;
      const fail = (message: string) => { if (!settled) { settled = true; zip.close(); reject(bad(message)); } };
      zip.on('error', () => fail('Invalid EPUB archive.'));
      zip.on('end', () => { if (!settled) { settled = true; resolve(files); } });
      zip.on('entry', (entry: yauzl.Entry) => {
        if (++entries > 1500 || entry.uncompressedSize > 8 * 1024 * 1024 || (total += entry.uncompressedSize) > 40 * 1024 * 1024) {
          fail('EPUB expansion exceeds the safe import limit.'); return;
        }
        if (entry.generalPurposeBitFlag & 1) { fail('Encrypted EPUB files are not supported.'); return; }
        if (!/\.(?:opf|xhtml|html|htm|xml|txt)$/i.test(entry.fileName) && entry.fileName !== 'mimetype') { zip.readEntry(); return; }
        zip.openReadStream(entry, (readError, stream) => {
          if (readError || !stream) { fail('EPUB chapter could not be read.'); return; }
          const chunks: Buffer[] = []; let size = 0;
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 8 * 1024 * 1024) { stream.destroy(); fail('EPUB chapter is too large.'); } else chunks.push(chunk);
          });
          stream.on('error', () => fail('EPUB chapter is damaged.'));
          stream.on('end', () => { if (!settled) { files.set(entry.fileName, Buffer.concat(chunks).toString('utf8')); zip.readEntry(); } });
        });
      });
      zip.readEntry();
    });
  });
}

function classify(title: string): ImportedChapter['kind'] {
  if (/glossary/i.test(title)) return 'glossary';
  return /^(?:contents|table of contents|index|copyright|title page|colophon|dedication|cover)$/i.test(title.trim()) ? 'frontmatter' : 'body';
}

/** Normalize plain text without ever executing book markup. */
export function textChapters(text: string, title: string): ImportedChapter[] {
  if (text.length > limit) throw bad('The extracted text exceeds the two-million-character import limit.');
  const parts = text.replace(/\r\n/g,'\n').split(/\n(?=#{1,2} [^\n]+\n)/);
  return parts.filter(p => p.trim()).slice(0,300).map((body,index) => {
    const heading = /^#{1,2} (.+)$/m.exec(body)?.[1] ?? (parts.length === 1 ? title : `Chapter ${index+1}`);
    return { title: heading.slice(0,500), body: body.trim().slice(0,300000), kind: classify(heading) };
  });
}

export async function importBook(buffer: Buffer, filename: string): Promise<ImportedBook> {
  const ext = path.extname(filename).toLowerCase();
  const title = path.basename(filename,path.extname(filename)).replace(/[_-]+/g,' ').slice(0,500) || 'Untitled book';
  if (['.txt','.md','.markdown'].includes(ext)) {
    if (buffer.includes(0)) throw bad('This file is not a readable UTF-8 text book.');
    return { title, author:'', format:'manual', chapters:textChapters(buffer.toString('utf8'),title) };
  }
  if (ext === '.pdf') {
    if (!buffer.subarray(0,1024).includes(Buffer.from('%PDF-'))) throw bad('This file does not have a PDF signature.');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data:new Uint8Array(buffer), isEvalSupported:false, useSystemFonts:true });
    let document;
    try { document = await task.promise; } catch { throw bad('This PDF could not be read. Encrypted PDFs are not supported.'); }
    try {
      if (document.numPages > 500) throw bad('PDF import is limited to 500 pages.');
      const chapters: ImportedChapter[]=[]; let size=0;
      for (let page=1;page<=document.numPages;page++) {
        const content=await (await document.getPage(page)).getTextContent();
        const body=content.items.map(item=>'str' in item ? item.str + ('hasEOL' in item && item.hasEOL ? '\n':' ') : '').join('').trim();
        size+=body.length; if (size>limit) throw bad('PDF extracted text exceeds the safe import limit.');
        chapters.push({title:`Page ${page}`,body:body.slice(0,300000),kind:'body'});
      }
      return {title,author:'',format:'pdf',chapters};
    } finally { await document.destroy(); }
  }
  if (ext !== '.epub') throw bad('Import supports DRM-free EPUB, PDF, Markdown, and UTF-8 text. Other formats are not yet supported.');
  const files=await unzipText(buffer);
  const container=load(files.get('META-INF/container.xml') ?? '',{xml:true});
  const opfPath=container('rootfile').first().attr('full-path');
  if (!opfPath || !files.has(opfPath)) throw bad('EPUB package metadata is missing.');
  const opf=load(files.get(opfPath)!,{xml:true});
  const directory=path.posix.dirname(opfPath);
  const manifest=new Map<string,{href:string;properties:string}>();
  opf('manifest item').each((_i,element)=> { const item=opf(element); manifest.set(item.attr('id') ?? '', {href:item.attr('href') ?? '', properties:item.attr('properties') ?? ''}); });
  const chapters: ImportedChapter[]=[]; let size=0;
  opf('spine itemref').each((_i,element)=>{
    const item=manifest.get(opf(element).attr('idref') ?? '');
    if (!item || item.properties.split(' ').includes('nav')) return;
    const key=path.posix.normalize(path.posix.join(directory,decodeURIComponent(item.href.split('#')[0])));
    const source=files.get(key); if (!source) return;
    const html=load(source); html('script,style,nav,svg,iframe,object,form').remove();
    const heading=html('h1,h2,title').first().text().trim() || `Chapter ${chapters.length+1}`;
    html('br').replaceWith('\n'); html('p,div,section,h1,h2,h3,li,pre,blockquote').append('\n\n');
    const body=html('body').text().replace(/[ \t]+/g,' ').replace(/\n\s*\n\s*\n/g,'\n\n').trim();
    size+=body.length;
    if (body) chapters.push({title:heading.slice(0,500),body:body.slice(0,300000),kind:classify(heading)});
  });
  if (size>limit || chapters.length>300) throw bad('EPUB text exceeds the safe import limit.');
  if (!chapters.length) throw bad('No readable chapters were found in this EPUB.');
  const metadataTitle=opf('metadata').children().filter((_i,el)=>el.type==='tag' && /(?:^|:)title$/.test(el.name)).first().text();
  const author=opf('metadata').children().filter((_i,el)=>el.type==='tag' && /(?:^|:)creator$/.test(el.name)).first().text();
  return {title:metadataTitle.slice(0,500)||title,author:author.slice(0,300),format:'epub',chapters};
}

export const escapeXml=(value:string)=>value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]!));

/** Export a standards-shaped EPUB with escaped text and a complete navigation document. */
export function exportEpub(book:{id:string;title:string;author:string|null;language:string}, chapters:ImportedChapter[], bibliography:string): Buffer {
  const all=[...chapters,...(bibliography ? [{title:'References and license',body:bibliography,kind:'body' as const}]:[])];
  const pages=all.map((chapter,index)=>({name:`chapter-${index+1}.xhtml`,title:chapter.title,body:chapter.body}));
  const files:Record<string,Uint8Array|[Uint8Array,{level:0}]>={
    mimetype:[strToU8('application/epub+zip'),{level:0}],
    'META-INF/container.xml':strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
  };
  const nav=pages.map((page,index)=>`<li><a href="${page.name}">${escapeXml(page.title || `Chapter ${index+1}`)}</a></li>`).join('');
  files['OEBPS/nav.xhtml']=strToU8(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${nav}</ol></nav></body></html>`);
  for (const page of pages) files[`OEBPS/${page.name}`]=strToU8(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXml(book.language)}"><head><title>${escapeXml(page.title)}</title></head><body><h1>${escapeXml(page.title)}</h1>${page.body.split(/\n\s*\n/).map(p=>`<p>${escapeXml(p).replace(/\n/g,'<br/>')}</p>`).join('')}</body></html>`);
  files['OEBPS/content.opf']=strToU8(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${book.id}</dc:identifier><dc:title>${escapeXml(book.title)}</dc:title><dc:creator>${escapeXml(book.author||'')}</dc:creator><dc:language>${escapeXml(book.language)}</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/,'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${pages.map((p,i)=>`<item id="c${i}" href="${p.name}" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${pages.map((_p,i)=>`<itemref idref="c${i}"/>`).join('')}</spine></package>`);
  return Buffer.from(zipSync(files,{level:6}));
}
