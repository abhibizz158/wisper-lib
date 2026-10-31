import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import type { ImportedBook } from './import.js';
import { ApiError } from '../lib/errors.js';
let active=0;

/** Limit CPU-heavy imports and move parsing away from interactive API requests. */
export async function parseImport(file:Buffer,filename:string):Promise<ImportedBook> {
  if (active>=2) throw new ApiError(429,'IMPORT_BUSY','Two imports are already running. Please try again shortly.');
  active++;
  try {
    const compiled=new URL('./import-worker.js',import.meta.url);
    const entry=existsSync(compiled) ? compiled:new URL('./import-worker.ts',import.meta.url);
    return await new Promise<ImportedBook>((resolve,reject)=>{
      const compiledEntry=existsSync(compiled);
      const workerData={bytes:new Uint8Array(file),filename,moduleUrl:entry.href,tsxApi:compiledEntry?'':createRequire(import.meta.url).resolve('tsx/esm/api')};
      const worker=compiledEntry
        ? new Worker(entry,{workerData,execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256}})
        : new Worker(`const {workerData}=require('node:worker_threads'); const {tsImport}=require(workerData.tsxApi); tsImport(workerData.moduleUrl,workerData.moduleUrl).catch(error=>{throw error;});`,{eval:true,workerData,execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256}});
      let finished=false;
      const timer=setTimeout(()=>finish(new ApiError(422,'IMPORT_TIMEOUT','Import took too long. Try a smaller book.')),60000);
      function finish(error:Error|null,result?:ImportedBook) {
        if(finished)return;finished=true;clearTimeout(timer);void worker.terminate();
        if(error)reject(error);else resolve(result!);
      }
      worker.once('message',(message:{result?:ImportedBook;error?:string})=>message.error?finish(new ApiError(422,'INVALID_BOOK',message.error)):finish(null,message.result));
      worker.once('error',()=>finish(new ApiError(422,'INVALID_BOOK','The import worker could not read this file.')));
      worker.once('exit',(code)=>{if(!finished)finish(new ApiError(422,'INVALID_BOOK',`The import worker stopped before completing (${code}).`));});
    });
  } finally {active--;}
}
