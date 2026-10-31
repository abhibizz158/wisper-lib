import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const apiDir = path.join(root, 'apps/api');
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = /^pnpm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager)?.[1];
const children = new Set();
let stopping = false;

function help() {
  console.log(`Usage: ./run.sh [options]  (Windows: run.cmd [options])

Installs workspace dependencies, builds shared types, prepares the local
PostgreSQL database, applies pending migrations, and starts API + web + shared watch.

  --web-port PORT   Web/LAN port (WEB_PORT, default 5173)
  --api-port PORT   Loopback API port (API_PORT or API .env PORT, default 3001)
  --localhost       Expose the website only on this computer
  --setup-only      Prepare dependencies and database without starting servers
  --skip-install    Skip dependency installation after a successful setup
  --help            Show this message

Requires Node.js >=20 with npm (22/24 LTS recommended), and either your
configured local PostgreSQL or a running Docker engine for automatic setup.
New databases use DB_PORT (default 5432). Existing .env settings are preserved.
The development account is shared by everyone who can reach the website.`);
}

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--help', '--localhost', '--setup-only', '--skip-install'].includes(arg)) {
      result[arg.slice(2)] = true;
    } else if (['--web-port', '--api-port'].includes(arg) && args[i + 1]) {
      result[arg.slice(2)] = args[++i];
    } else {
      throw new Error(`Unknown or incomplete option: ${arg}. Use --help.`);
    }
  }
  return result;
}

function port(value, name) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535.`);
  }
  return Number(value);
}

/** Spawn without a shell, and track complete server process groups for shutdown. */
function launch(command, args, { cwd = root, env = process.env, capture = false } = {}) {
  const child = spawn(command, args, {
    cwd, env, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    detached: process.platform !== 'win32', windowsHide: true,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  child.once('error', () => children.delete(child));
  return child;
}

async function run(command, args, opts = {}) {
  const child = launch(command, args, opts);
  let output = '';
  if (opts.capture) child.stdout.on('data', (chunk) => { output += chunk; });
  // Capture, but never echo database credentials or Docker configuration.
  if (opts.capture) child.stderr.on('data', () => {});
  await new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error(`Could not start ${path.basename(command)}. Check that it is installed.`)));
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with code ${code ?? 'signal'}.`)));
  });
  return output;
}

/** Find npm's JavaScript entry point so Windows needs no shell quoting or .cmd spawn. */
function npmEntry() {
  const execDir = path.dirname(realpathSync(process.execPath));
  const candidates = [
    process.env.npm_execpath,
    path.join(execDir, 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(execDir, '../lib/node_modules/npm/bin/npm-cli.js'),
  ];
  for (const folder of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const name of ['npm', 'npm.cmd']) {
      const candidate = path.join(folder, name);
      if (!existsSync(candidate)) continue;
      const resolved = realpathSync(candidate);
      if (resolved.endsWith('npm-cli.js')) candidates.push(resolved);
      candidates.push(path.join(path.dirname(resolved), 'node_modules/npm/bin/npm-cli.js'));
    }
  }
  const found = candidates.find((candidate) => candidate?.endsWith('npm-cli.js') && existsSync(candidate));
  if (!found) throw new Error('npm is missing. Install Node.js with npm from https://nodejs.org/.');
  return found;
}

async function assertPortAvailable(value, host, label) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`${label} port ${value} is unavailable. Choose another port; existing services will not be stopped.`)));
    server.listen(value, host, () => server.close(resolve));
  });
}

/** A missing environment file gets a persistent, loopback-only Docker database. */
async function prepareEnvironment(parse) {
  const envPath = path.join(apiDir, '.env');
  if (!existsSync(envPath)) {
    let databaseUrl = process.env.DATABASE_URL;
    let managed = '';
    if (!databaseUrl) {
      const dbPort = port(process.env.DB_PORT ?? 5432, 'DB_PORT');
      await assertPortAvailable(dbPort, '127.0.0.1', 'Database');
      const password = randomBytes(24).toString('hex');
      databaseUrl = `postgresql://wisper:${password}@127.0.0.1:${dbPort}/wisperlib`;
      managed = '\nLOCAL_DATABASE_MANAGED=true\n';
    }
    const example = readFileSync(path.join(apiDir, '.env.example'), 'utf8');
    writeFileSync(envPath, example.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${JSON.stringify(databaseUrl)}`) + managed, { mode: 0o600, flag: 'wx' });
    console.log('Created ignored apps/api/.env; existing environment files are never overwritten.');
  }
  const fileEnv = parse(readFileSync(envPath));
  const env = { ...fileEnv, ...process.env, NODE_ENV: 'development' };
  if (process.env.DATABASE_URL && process.env.DATABASE_URL !== fileEnv.DATABASE_URL
      && process.env.LOCAL_DATABASE_MANAGED === undefined) {
    env.LOCAL_DATABASE_MANAGED = 'false';
  }
  return env;
}

async function startManagedDatabase(env, url) {
  if (env.LOCAL_DATABASE_MANAGED !== 'true') return;
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Managed database must use loopback networking.');
  try {
    await run('docker', ['info', '--format', '{{.ServerVersion}}'], { capture: true });
  } catch {
    throw new Error('Automatic database setup requires a running Docker engine. Start Docker Desktop/Engine, or set DATABASE_URL for your existing local PostgreSQL in apps/api/.env.');
  }
  const projectId = createHash('sha256').update(realpathSync(root)).digest('hex').slice(0, 10);
  const name = `wisper-lib-postgres-${projectId}`;
  let existing;
  try { existing = JSON.parse(await run('docker', ['inspect', name], { capture: true }))[0]; } catch { /* A first run has no container. */ }
  if (existing) {
    if (existing.Config.Labels?.['dev.wisper-lib.project'] !== projectId) throw new Error('Database container name is already in use by another project.');
    const binding = existing.HostConfig.PortBindings?.['5432/tcp']?.[0];
    if (binding?.HostIp !== '127.0.0.1' || binding?.HostPort !== (url.port || '5432')) throw new Error('Managed database port changed. Restore its original DATABASE_URL or configure another local PostgreSQL database.');
    if (!existing.State.Running) await run('docker', ['start', name], { capture: true });
  } else {
    await assertPortAvailable(port(url.port || 5432, 'Database port'), '127.0.0.1', 'Database');
    await run('docker', [
      'run', '--detach', '--name', name, '--label', `dev.wisper-lib.project=${projectId}`,
      '--publish', `127.0.0.1:${url.port || 5432}:5432`,
      '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER=wisper', '--env', 'POSTGRES_DB=wisperlib',
      '--mount', `type=volume,source=${name}-data,target=/var/lib/postgresql/data`, 'postgres:17',
    ], { env: { ...env, POSTGRES_PASSWORD: decodeURIComponent(url.password) } });
  }
  console.log('Managed PostgreSQL is persistent and bound to loopback only.');
}

async function databaseReady(env, pg) {
  const url = new URL(env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('This local launcher only migrates a loopback PostgreSQL database. Remote/cloud databases require a separate deployment workflow.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
  await startManagedDatabase(env, url);
  const attempts = env.LOCAL_DATABASE_MANAGED === 'true' ? 40 : 1;
  for (let i = 0; i < attempts; i++) {
    const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 1500 });
    try {
      await client.connect();
      await client.query('SELECT 1');
      return url;
    } catch (error) {
      if (error.code === '3D000') {
        const adminUrl = new URL(env.DATABASE_URL);
        adminUrl.pathname = '/postgres';
        const admin = new pg.Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 1500 });
        try {
          await admin.connect();
          const database = decodeURIComponent(url.pathname.slice(1));
          if (!database) throw new Error('Database name is missing.');
          await admin.query(`CREATE DATABASE "${database.replaceAll('"', '""')}"`);
          console.log('Created the configured local database.');
          return url;
        } finally { await admin.end().catch(() => {}); }
      }
      if (i === attempts - 1) throw new Error(`PostgreSQL is not ready at ${url.hostname}:${url.port || 5432}. Start the configured database and check apps/api/.env. No data was reset.`);
      await delay(1000);
    } finally { await client.end().catch(() => {}); }
  }
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  const active = [...children];
  for (const child of active) {
    if (!child.pid) continue;
    try {
      if (process.platform === 'win32') {
        await new Promise((resolve) => {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
          killer.once('error', resolve); killer.once('exit', resolve);
        });
      } else { process.kill(-child.pid, 'SIGTERM'); }
    } catch { /* The process may already have stopped. */ }
  }
  await delay(500);
  if (process.platform !== 'win32') {
    for (const child of active) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already stopped. */ } }
  }
  process.exit(code);
}

async function ready(url, label) {
  for (let i = 0; i < 120 && !stopping; i++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* Watch processes need time to compile and bind their ports. */ }
    await delay(500);
  }
  throw new Error(`${label} did not become ready. Check the server output above.`);
}

async function main() {
  const opts = options(process.argv.slice(2));
  if (opts.help) { help(); return; }
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js >=20 is required; use Node.js 22 or 24 LTS with npm.');
  if (!version) throw new Error('package.json must declare an exact pnpm version in packageManager.');
  const npm = npmEntry();
  const pnpmArgs = ['exec', '--yes', `--package=pnpm@${version}`, '--', 'pnpm'];
  const packageEnv = { ...process.env, NODE_ENV: 'development' };
  const pnpm = (args, env = packageEnv) => run(process.execPath, [npm, ...pnpmArgs, ...args], { env });
  if (!opts['skip-install']) {
    console.log(`Installing workspace packages with pnpm ${version} (cached downloads reused)...`);
    await pnpm(['install', '--prefer-offline', '--no-frozen-lockfile', '--prod=false']);
  }
  const require = createRequire(path.join(apiDir, 'package.json'));
  let parse, pg;
  try {
    ({ parse } = require('dotenv'));
    pg = require('pg');
  } catch {
    throw new Error('Workspace packages are missing. Run again without --skip-install.');
  }
  const env = await prepareEnvironment(parse);
  const webPort = port(opts['web-port'] ?? env.WEB_PORT ?? 5173, 'Web port');
  const apiPort = port(opts['api-port'] ?? env.API_PORT ?? env.PORT ?? 3001, 'API port');
  if (apiPort === webPort) throw new Error('Web and API ports must be different.');
  const webHost = opts.localhost ? '127.0.0.1' : '0.0.0.0';
  env.HOST = '127.0.0.1';
  env.PORT = String(apiPort);
  env.WEB_PORT = String(webPort);
  env.WEB_HOST = webHost;
  env.API_PROXY_TARGET = `http://127.0.0.1:${apiPort}`;
  env.WEB_ORIGIN = `http://localhost:${webPort}`;
  if (!opts['setup-only']) {
    await assertPortAvailable(webPort, webHost, 'Web');
    await assertPortAvailable(apiPort, '127.0.0.1', 'API');
  }
  const uploads = path.resolve(apiDir, env.UPLOADS_DIR || './uploads');
  mkdirSync(uploads, { recursive: true });
  env.UPLOADS_DIR = uploads;
  const dbUrl = await databaseReady(env, pg);
  await pnpm(['--filter', '@wisper-lib/shared-types', 'build'], env);
  await pnpm(['db:migrate'], env);
  if (opts['setup-only']) { console.log('Local setup complete. Run again without --setup-only to start the servers.'); return; }
  for (const name of ['@wisper-lib/shared-types', 'api', 'web']) {
    const child = launch(process.execPath, [npm, ...pnpmArgs, '--filter', name, 'dev'], { env });
    child.once('error', () => { if (!stopping) { console.error(`Could not start ${name}.`); void stop(1); } });
    child.once('exit', (code) => { if (!stopping) { console.error(`${name} stopped (${code ?? 'signal'}); stopping the other servers.`); void stop(code || 1); } });
  }
  await ready(`http://127.0.0.1:${apiPort}/api/v1/me`, 'API/database');
  await ready(`http://127.0.0.1:${webPort}/api/v1/me`, 'Web proxy');
  console.log(`\nLocal website: http://localhost:${webPort}`);
  if (!opts.localhost) {
    const addresses = new Set(Object.values(networkInterfaces()).flat().filter((item) => item && !item.internal && item.family === 'IPv4').map((item) => item.address));
    for (const address of addresses) console.log(`LAN website:   http://${address}:${webPort}`);
  }
  console.log(`API:           http://127.0.0.1:${apiPort}/api/v1 (loopback only)`);
  console.log(`LAN API:       use the website URL followed by /api/v1`);
  console.log(`PostgreSQL:    ${dbUrl.hostname}:${dbUrl.port || 5432} (local database)`);
  console.log('Development account is shared on your trusted LAN. Camera/VR capabilities may require HTTPS.');
  console.log('Press Ctrl+C to stop all dev servers. Database data is retained.\n');
}

process.on('SIGINT', () => { void stop(0); });
process.on('SIGTERM', () => { void stop(0); });
main().catch((error) => { console.error(`\nStartup failed: ${error.message}`); void stop(1); });
