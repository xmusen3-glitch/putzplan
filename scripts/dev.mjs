// Entwicklung: startet den Server (Port 8080) und Vite (Port 5173) zusammen.
import { spawn } from 'node:child_process';

const run = (cmd, args, env = {}) => spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
const server = run(process.execPath, ['--watch-path=server', '--watch-path=shared', 'server/index.js'], { PORT: '8080' });
const vite = run(process.execPath, ['node_modules/vite/bin/vite.js']);
const stop = () => { server.kill(); vite.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', stop);
vite.on('exit', stop);
