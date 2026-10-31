import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PollyClient, SynthesizeSpeechCommand, type VoiceId, type LanguageCode } from '@aws-sdk/client-polly';
import type { BookContent, LibraryBook, SpeechLanguage, WhisperPreview } from '@wisper-lib/shared-types';
import { db } from '../db/client.js';
import { config } from '../lib/config.js';
import { escapeXml } from './import.js';

export const speechLanguages:SpeechLanguage[]=[
  {code:'en-US',label:'English (US)',voice:'Joanna'}, {code:'en-GB',label:'English (UK)',voice:'Brian'},
  {code:'es-ES',label:'Español',voice:'Lucia'}, {code:'fr-FR',label:'Français',voice:'Celine'},
  {code:'de-DE',label:'Deutsch',voice:'Marlene'}, {code:'it-IT',label:'Italiano',voice:'Carla'},
  {code:'pt-BR',label:'Português (Brasil)',voice:'Camila'}, {code:'hi-IN',label:'हिन्दी',voice:'Aditi'},
  {code:'ja-JP',label:'日本語',voice:'Mizuki'},
];

/** Select prose, never headings, a contents listing, code fences, or navigation links. */
export function prose(text:string,offset=0):string {
  const relevant=text.slice(Math.max(0,offset)).replace(/```[\s\S]*?```/g,'\n').replace(/~~~[\s\S]*?~~~/g,'\n');
  const paragraphs=relevant.split(/\n\s*\n/).map(part=>part.split('\n').filter(line=>!/^\s*(?:#{1,6}\s|\[\d+\]:|[-*+]\s|\d+[.)]\s|\|)/.test(line)).join(' ').trim());
  const chosen=paragraphs.find(part=>part.length>=60 && /[\p{L}]/u.test(part) && !/^\s*(?:copyright|contents|table of contents|index|all rights reserved)\b/i.test(part));
  const normalized=(chosen ?? '').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`<>#]/g,'').replace(/\s+/g,' ').trim();
  const excerpt=normalized.slice(0,650);
  if (normalized.length<=650) return excerpt;
  const sentence=Math.max(excerpt.lastIndexOf('. '),excerpt.lastIndexOf('。'),excerpt.lastIndexOf('।'));
  return sentence>120 ? excerpt.slice(0,sentence+1) : excerpt.slice(0,excerpt.lastIndexOf(' '))+'…';
}

export function selectPreview(book:LibraryBook,content:BookContent,language:string):WhisperPreview {
  const selected=speechLanguages.find(item=>item.code===language) ?? speechLanguages[0];
  let location:Record<string,unknown>|null=null;
  try { location=book.lastLocation ? JSON.parse(book.lastLocation) : null; } catch { /* Old location formats fall back to readable prose. */ }
  let transcript=''; let source:WhisperPreview['source']='description'; let chosenLocation:string|null=null;
  if (location && typeof location.chapterId==='string') {
    const index=content.chapters.findIndex(chapter=>chapter.id===location!.chapterId);
    if (index>=0) {
      const nearby=[content.chapters[index],...content.chapters.slice(index+1),...content.chapters.slice(0,index).reverse()];
      for (const [step,chapter] of nearby.entries()) {
        if (chapter.kind==='frontmatter') continue;
        transcript=prose(chapter.body,step===0 && typeof location.offset==='number' ? location.offset:0) || prose(chapter.body);
        if (transcript) { source='last-location'; chosenLocation=JSON.stringify({chapterId:chapter.id,page:step===0 ? location.page??0:0,offset:step===0 ? location.offset??0:0}); break; }
      }
    }
  }
  if (!transcript) {
    for (const chapter of [...content.chapters.filter(chapter=>chapter.kind==='glossary'),...content.chapters.filter(chapter=>chapter.kind==='body')]) {
      transcript=prose(chapter.body);
      if (transcript) { source=chapter.kind==='glossary' ? 'glossary':'body'; chosenLocation=JSON.stringify({chapterId:chapter.id,page:0,offset:0}); break; }
    }
  }
  if (!transcript) transcript=prose(book.description??'') || `A quiet place is waiting for ${book.title}. Add readable pages to hear a passage.`;
  return {transcript,audioUrl:null,cached:false,provider:'text',language:selected.code,voice:selected.voice,location:chosenLocation,source};
}

const inFlight=new Map<string,Promise<WhisperPreview>>();
const limiter=new Map<string,{count:number;since:number}>();
let polly:PollyClient|undefined;

/** Synthesize only after explicit consent; cache by owner, exact text, voice, engine, and locale. */
export async function synthesize(owner:string,bookId:string,preview:WhisperPreview):Promise<WhisperPreview> {
  if (!process.env.AWS_REGION) return {...preview,message:'Amazon Polly is not configured. Read the transcript or choose a device voice.'};
  const ssml=`<speak><amazon:effect name="whispered"><prosody rate="90%" pitch="-6%">${escapeXml(preview.transcript)}</prosody></amazon:effect></speak>`;
  const hash=createHash('sha256').update(ssml).digest('hex');
  const key=[owner,hash,preview.voice,preview.language].join(':');
  const cached=await db.query(`SELECT id,audio_path FROM whisper_assets WHERE owner_id=$1 AND text_hash=$2 AND voice=$3 AND engine='standard' AND locale=$4 AND state='ready'`,[owner,hash,preview.voice,preview.language]);
  if (cached.rows[0]?.audio_path) {
    try { await readFile(path.join(config.uploadsDir,cached.rows[0].audio_path)); return {...preview,provider:'polly',cached:true,audioUrl:`/api/v1/whispers/${cached.rows[0].id}/audio`}; } catch { /* Regenerate a missing cache file. */ }
  }
  if (inFlight.has(key)) return inFlight.get(key)!;
  if (inFlight.size >= 8) return {...preview,message:'Preview generation is busy. Please try again shortly or use the transcript.'};
  for (const [user,entry] of limiter) if (Date.now()-entry.since>=3600000) limiter.delete(user);
  if (!limiter.has(owner) && limiter.size>=5000) return {...preview,message:'Preview capacity is busy. The transcript remains available.'};
  const current=limiter.get(owner);
  const allowance=current && Date.now()-current.since<3600000 ? current:{count:0,since:Date.now()};
  if (allowance.count>=30) return {...preview,message:'Hourly preview allowance reached. The transcript and device voice remain available.'};
  allowance.count++; limiter.set(owner,allowance);
  const promise=(async()=>{
    try {
      polly ??= new PollyClient({region:process.env.AWS_REGION,maxAttempts:1,requestHandler:{requestTimeout:12000,connectionTimeout:3000}});
      const response=await polly.send(new SynthesizeSpeechCommand({Engine:'standard',OutputFormat:'mp3',TextType:'ssml',Text:ssml,VoiceId:preview.voice as VoiceId,LanguageCode:preview.language as LanguageCode}));
      if (!response.AudioStream) throw new Error('No audio');
      const id=randomUUID(); const filename=`whisper-${id}.mp3`;
      await writeFile(path.join(config.uploadsDir,filename),await response.AudioStream.transformToByteArray());
      const row=await db.query(`INSERT INTO whisper_assets(id,owner_id,book_id,text_hash,voice,engine,locale,audio_path,transcript,state) VALUES($1,$2,$3,$4,$5,'standard',$6,$7,$8,'ready') ON CONFLICT(owner_id,text_hash,voice,engine,locale) DO UPDATE SET audio_path=EXCLUDED.audio_path,transcript=EXCLUDED.transcript,state='ready' RETURNING id`,[id,owner,bookId,hash,preview.voice,preview.language,filename,preview.transcript]);
      return {...preview,provider:'polly' as const,audioUrl:`/api/v1/whispers/${row.rows[0].id}/audio`};
    } catch { return {...preview,message:'Polly is unavailable for this account, region, or voice. Your transcript is ready; device speech is optional.'}; }
    finally { inFlight.delete(key); }
  })();
  inFlight.set(key,promise);
  return promise;
}
