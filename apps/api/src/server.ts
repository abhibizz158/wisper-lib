import 'dotenv/config';
import { createApp } from './app.js';
import { config } from './lib/config.js';
import { checkDbConnection, db } from './db/client.js';

const app=await createApp({logging:true});
app.addHook('onClose',async()=>{await db.end();});
for (const signal of ['SIGINT','SIGTERM'] as const) {
  process.once(signal,()=>{void app.close().then(()=>process.exit(0)).catch(()=>process.exit(1));});
}
try {
  await checkDbConnection();
  app.log.info('[db] PostgreSQL connection verified');
  app.log.info(`[polly] ${process.env.AWS_REGION ? 'configured for explicit preview requests':'optional; text previews work without AWS'}`);
  await app.listen({port:config.port,host:config.host});
} catch(error) {
  app.log.error(error,'The API could not start. Run the local launcher to prepare PostgreSQL and migrations.');
  await app.close();
  process.exitCode=1;
}
