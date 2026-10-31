import { parentPort, workerData } from 'node:worker_threads';
import { importBook } from './import.js';

try {
  const result=await importBook(Buffer.from(workerData.bytes),workerData.filename);
  parentPort?.postMessage({result});
} catch(error) {
  const failure=error as {message?:string;statusCode?:number};
  parentPort?.postMessage({error:failure.statusCode===422 ? failure.message:'The file could not be imported. It may be damaged, encrypted, or unsupported.'});
}
