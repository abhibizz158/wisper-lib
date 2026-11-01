import 'dotenv/config';
import Fastify from 'fastify';
import { mkdir } from 'node:fs/promises';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './lib/config.js';
import { sendError } from './lib/errors.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { libraryRoutes } from './routes/library.js';
import { voiceRoutes } from './routes/voice.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; email: string; displayName?: string };
  }
}

/** Build the local API independently from its network listener for integration tests. */
export async function createApp(options:{userId?:string;logging?:boolean}={}) {
  const app=Fastify({
    bodyLimit:4*1024*1024,
    logger:options.logging ? {transport:config.isDev ? {target:'pino-pretty',options:{colorize:true}}:undefined}:false,
  });
  app.setErrorHandler((error,_request,reply)=>sendError(reply,error));
  app.setNotFoundHandler((_request,reply)=>reply.status(404).send({error:{code:'NOT_FOUND',message:'Route not found'}}));
  await app.register(cors,{origin:config.webOrigin,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],credentials:false});
  await app.register(multipart,{limits:{fileSize:50*1024*1024,files:1,fields:20,fieldSize:100000}});
  await mkdir(config.uploadsDir,{recursive:true});
  // TODO(auth): replace with Cognito JWT verification before any public deployment.
  // Phase 1 deliberately shares one local user; userId is an internal test seam.
  app.addHook('preHandler',async request=>{
    request.user={id:options.userId ?? 'local-user-001',email:'reader@local',displayName:'Local Reader'};
  });
  app.addHook('onSend',async(_request,reply)=>{
    if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control','private, no-store');
    reply.header('X-Content-Type-Options','nosniff');
  });
  await app.register(healthRoutes,{prefix:'/api/v1'});
  await app.register(meRoutes,{prefix:'/api/v1'});
  await app.register(libraryRoutes,{prefix:'/api/v1'});
  await app.register(voiceRoutes,{prefix:'/api/v1'});
  return app;
}
