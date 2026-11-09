import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { act, canUndoAction, createGame, actor, playerView } from './public/game.mjs';

const root = fileURLToPath(new URL('./public/',import.meta.url));
const port = Number(process.env.PORT || 4173);
const lan = process.argv.includes('--lan');
const ips = Object.values(networkInterfaces()).flat().filter(i => i.family==='IPv4' && !i.internal).map(i=>i.address);
const addresses = lan ? ips.map(ip => 'http://'+ip+':'+port) : [];
const rooms = new Map();
const mime = { '.html':'text/html', '.css':'text/css', '.mjs':'text/javascript', '.webp':'image/webp', '.svg':'image/svg', '.pdf':'application/pdf' };
const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(data));
};

async function input(req) {
  if (req.headers['content-type']?.split(';')[0]!=='application/json') throw new Error('Send a JSON request.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size>4096) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function snapshot(room,side) {
  return { game:playerView(room.game,side), actor:actor(room.game), side, connected:!!room.B, canUndo:room.undo?.side===side };
}

async function api(req,res,path) {
  if (path==='/api/info' && req.method==='GET') return json(res,200,{ addresses });
  if (path==='/api/rooms' && req.method==='POST') {
    const options = await input(req);
    for (const [code,room] of rooms) if (Date.now()-room.touched>86400000) rooms.delete(code);
    if (rooms.size>=32) return json(res,429,{ error:'This host has reached its room limit.' });
    let code;
    do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
    const room = { R:randomUUID(), B:null, game:createGame({ ...options, mode:'lan' }), touched:Date.now() };
    rooms.set(code,room);
    return json(res,201,{ code, key:room.R, ...snapshot(room,'R') });
  }
  const match = /^\/api\/rooms\/([A-F0-9]{6})(\/join)?$/.exec(path);
  const room = match && rooms.get(match[1]);
  if (!room) return json(res,404,{ error:'Room not found on this host. Check the invite address and room code.' });
  if (match[2] && req.method==='POST') {
    await input(req);
    if (room.B) return json(res,409,{ error:'Both seats are already claimed. Reopen the invite in the original browser to reconnect.' });
    room.B = randomUUID();
    room.touched = Date.now();
    return json(res,200,{ code:match[1], key:room.B, ...snapshot(room,'B') });
  }
  if (match[2]) return json(res,405,{ error:'This request is unavailable.' });

  const key = req.headers.authorization?.slice(7);
  const side = key && (key===room.R ? 'R' : key===room.B ? 'B' : null);
  if (!side) return json(res,403,{ error:'This browser does not hold a seat in that room.' });
  room.touched = Date.now();
  if (req.method==='GET') return json(res,200,snapshot(room,side));
  if (req.method==='POST') {
    const { rev, action } = await input(req);
    if (rev!==room.game.rev) return json(res,409,{ ...snapshot(room,side), error:'The position changed. Review the updated board.' });
    if (action?.type==='undo') {
      if (room.undo?.side!==side) return json(res,409,{ ...snapshot(room,side), error:'There is no action you can undo.' });
      room.game = { ...room.undo.game, rev:rev+1 };
      room.undo = null;
      return json(res,200,snapshot(room,side));
    }
    if (!room.B && action?.type==='deploy-ready') return json(res,409,{ error:'Wait for Blue to join before locking deployment.' });
    const next = structuredClone(room.game);
    act(next,side,action);
    room.undo = canUndoAction(room.game,next,action,side) ? { side, game:room.game } : null;
    room.game = next;
    return json(res,200,snapshot(room,side));
  }
  return json(res,405,{ error:'This request is unavailable.' });
}

const server = createServer(async (req,res) => {
  try {
    const path = new URL(req.url,'http://localhost').pathname;
    if (path.startsWith('/api/')) return await api(req,res,path);
    const file = path==='/' ? 'index.html' : path.slice(1);
    if (req.method!=='GET' || !/^(?:(?:assets|rules)\/)?[\w.-]+$/.test(file) || !mime[extname(file)]) {
      res.writeHead(404).end();
      return;
    }
    const target = join(root,file);
    const stat = statSync(target,{ throwIfNoEntry:false });
    if (!stat?.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200,{
      'Content-Type':mime[extname(file)], 'Content-Length':stat.size,
      'Cache-Control':file.includes('/') ? 'public, max-age=3600' : 'no-cache',
      'X-Content-Type-Options':'nosniff'
    });
    createReadStream(target).pipe(res);
  } catch (error) {
    if (!res.headersSent && !res.destroyed) json(res,400,{ error:error.message });
  }
});
server.listen(port,lan?'0.0.0.0':'127.0.0.1',() => {
  console.log('\nKRIEGSPIEL  |  FIELD TABLE');
  console.log('On this computer  http://127.0.0.1:'+port);
  addresses.forEach(url => console.log('On your network   '+url));
  console.log('Keep this window open while playing. Ctrl+C closes the table.\n');
});
