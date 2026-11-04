// A small market maker for Rizon's BTC-15s book: a bid and an ask around the price, re-posted as it moves, leaning
// against whatever it has built up. It's paper money on a real order book, so a bad idea costs nothing.
//   bun bot.ts            makes an account on first run and saves its key to .env
//   Ctrl-C                cancels its quotes and exits
const URL_BASE = process.env.RIZON_URL ?? 'https://rizon.markets';
const MARKET = 'BTC-15s';
const UNDERLYING = 'BTC-USD';

// the settings worth changing first
const SIZE = 20; // dollars a side
const WIDTH = 4; // strikes between your bid and ask
const SKEW_PER_100 = 1; // strikes to lean against each $100 of net position
const MAX_LOSS = 200; // stop if the session loses this much
const REQUOTE_MS = 334; // at most 3 re-quotes a second

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${URL_BASE}/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${KEY}`, ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json.error ?? ''}`);
  return json;
}

let KEY = process.env.RIZON_API_KEY ?? '';
if (!KEY) {
  const made = (await (await fetch(`${URL_BASE}/api/v1/accounts`, { method: 'POST' })).json()) as { key: string; account: { name: string } };
  KEY = made.key;
  await Bun.write('.env', `RIZON_API_KEY=${KEY}\n`);
  console.log(`made account ${made.account.name}; its key is in .env`);
}

interface Position { id: string; side: 'up' | 'down'; size: number; result: string | null; pnl: number | null }

let spot: number | null = null;
let live = false;
let quotes: string[] = []; // the ids of its resting orders
let quoted: [number, number] | null = null;
let lastQuote = 0;
let busy = false;
let fills = 0;
let losers = 0;
let pnl = 0;
const open = new Map<string, Position>();

/** Up positions less down positions, in dollars. */
const net = () => [...open.values()].reduce((sum, p) => sum + (p.side === 'up' ? p.size : -p.size), 0);

async function requote(): Promise<void> {
  if (busy || spot === null || !live || Date.now() - lastQuote < REQUOTE_MS) return;
  const lean = Math.round((net() / 100) * SKEW_PER_100);
  const bid = Math.floor(spot - WIDTH / 2) - lean;
  const ask = bid + WIDTH;
  if (quoted?.[0] === bid && quoted[1] === ask) return;
  busy = true;
  lastQuote = Date.now();
  try {
    const r = await api<{ results: { order?: { id: string; status: string } }[] }>('POST', '/orders/batch', {
      cancel: quotes,
      orders: [
        { market: MARKET, side: 'up', size: SIZE, strike: bid, tif: 'post' },
        { market: MARKET, side: 'down', size: SIZE, strike: ask, tif: 'post' },
      ],
    });
    quotes = r.results.flatMap((o) => (o.order?.status === 'open' ? [o.order.id] : []));
    quoted = [bid, ask];
  } catch (err) {
    console.log((err as Error).message);
  } finally {
    busy = false;
  }
}

async function stop(why: string): Promise<never> {
  console.log(`${why}: canceling quotes`);
  if (quotes.length) await api('POST', '/orders/batch', { cancel: quotes }).catch(() => {});
  console.log(`${fills} fills, ${losers} lost, PnL $${pnl.toFixed(2)}`);
  process.exit(0);
}
process.on('SIGINT', () => void stop('Ctrl-C'));

function connect(): void {
  const ws = new WebSocket(`${URL_BASE.replace(/^http/, 'ws')}/api/v1/ws?channels=price:${UNDERLYING}`, { headers: { authorization: `Bearer ${KEY}` } } as unknown as string[]);
  ws.onmessage = (e) => {
    const { type, data } = JSON.parse(String(e.data));
    if (type === 'price') {
      spot = data.price;
      live = data.live;
      void requote();
    } else if (type === 'position') {
      const p = data as Position;
      if (p.result === null) {
        if (!open.has(p.id)) fills++;
        open.set(p.id, p);
      } else {
        open.delete(p.id);
        pnl += p.pnl ?? 0;
        if ((p.pnl ?? 0) < 0) losers++;
        if (pnl < -MAX_LOSS) void stop(`lost more than $${MAX_LOSS}`);
      }
    }
  };
  ws.onclose = () => setTimeout(connect, 2_000);
}
connect();

setInterval(() => console.log(`${new Date().toISOString().slice(11, 19)} spot ${spot} quotes ${quoted?.join(' / ') ?? '-'} open ${open.size} net $${net()} fills ${fills} lost ${losers} PnL $${pnl.toFixed(2)}`), 10_000);
