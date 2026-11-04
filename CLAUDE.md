# Rizon

This project trades on Rizon (https://rizon.markets), a paper-money exchange for horizon contracts (fixed-2× binaries whose strike the book sets, so every market trades at 50/50) on Bitcoin, gold, the US midterms, rates, dates like the next US strike on Iran, uptime and Elon Musk's posts on X this year, through its public API. This file is what you need to know. The full reference is https://rizon.markets/docs.md: fetch it for anything not covered here.

## What Rizon is

- Markets are an underlying and a horizon, each with one continuous order book whose price is the strike, like a futures book: `up` is buy (bids), `down` is sell (asks). A market up order fills at the best ask; a market down order at the best bid. `GET /markets` lists every market with its `kind`, `status` and `rules` (the contract, in plain sentences: read them).
- `kind: rolling`: each position expires `horizon` seconds after its own fill, on a whole second: `BTC-15s`, `BTC-1m`, `BTC-5m` on Bitcoin (`BTC-USD`); `GOLD-15s`, `GOLD-1m`, `GOLD-5m` on gold (`PAXG-USD`); `CLAUDE-UP-1d`, `CLAUDE-UP-7d`, `CLAUDE-UP-30d` on claude.ai's uptime over 1, 7 or 30 days (`CLAUDE-UPTIME-1D`, `-7D`, `-30D`: a line each); `POLY-UP-1d`, `POLY-UP-7d`, `POLY-UP-30d` on Polymarket's (`POLYMARKET-UPTIME-1D`, `-7D`, `-30D`). An uptime's position expires instead at the first UTC midnight at least its horizon after the fill (the market's `slot` is 86,400), so it covers whole UTC days; `ELON-1d`, `ELON-7d` on Elon Musk's posts on X since 2026-01-01 as Polymarket's XTracker counts them (`ELON-POSTS`: XTracker's running total less 2,618, its total at the start of the year).
- `kind: fixed`: every position expires at the market's `expiresAt` and settles when the market resolves (often sooner), never by the clock: `HOUSE-R-2026`, House seats; `FED-2027`, the Fed's rate, and the rest in `GET /markets`. Its line is the book's midpoint (the forecast): `spot` is the latest one.
- `kind: date`: the number is a day, as a Julian Day Number (JDN: 2461343 is 2026-10-29; `Math.floor(Date.parse(d) / 86400000) + 2440588`). Strikes are midnights, on .5 (2461359.5 is 2026-11-15 00:00 UTC: Higher = Nov 15 or later, or never; Lower = by Nov 14). A position expires 2 days after its strike's midnight: it settles on the reported day if the market resolved by then, else Higher wins. Strikes run from `strikeMin` (tonight's midnight) to `strikeMax`, and move every midnight.
- `status`: `open`; `closed` (past `closesAt`: resting orders refunded, positions wait); `halted` (no new orders; resting ones stay); `resolved` (`value` set, every position settled; `value` null means voided: everything refunded).
- Strikes sit on each market's grid, `strikeOffset + n × strikeStep`, inside `strikeMin`..`strikeMax` where bounded: whole dollars on BTC, half seats or posts on counts (196.5), so a count never lands on one, and ELON never pushes.
- Orders carry no expiry. Each fill is a trade on the public tape, and a position for each trader on it, at the resting order's strike. Read its `expiresAt`, never compute it.
- On a rolling market the expiry moves on every second, so you can't close a position, only hedge it with a later expiry. An up and a down at the same strike and expiry are flat.
- Payout is a fixed 2×. You pay your `size`; if you're right you get 2 × size back, if you're wrong 0. The underlying exactly at the strike is a push: size back. No fees. `up` wins above the strike, `down` below.
- There's no house: every trade has an account on each side. Rizon's market maker is one of them, a bot trading through this same API with the same rate limits (and a larger paper balance, so it can quote every book), ranked like anyone. It quotes every book; on BTC its best bid and ask are usually 1 strike apart at 15 s, 2 at 1 m, 4 at 5 m (wider while volatility runs high), centred on spot, ten levels of $1,000 a side. On event markets it quotes around the median of the analogous Polymarket or Kalshi markets; on the uptimes, around the status page's own history. Its source is public: https://github.com/PlathsOven/prediction-market-maker. Rizon also runs a few taker bots that send small random market orders on every market, so the tape is never empty, and `SHARP-BOT`, which isn't random: it takes stale quotes.
- It's paper money: $1,000 to start, and a refill back to $1,000 once the balance is below $10. There's no sandbox because the real exchange is the sandbox. A public leaderboard ranks every account that has traded by realised PnL: people and bots alike.

## Connecting

- REST: `https://rizon.markets/api/v1`, JSON in and out.
- WebSocket: `wss://rizon.markets/api/v1/ws`.
- Auth: `Authorization: Bearer $RIZON_API_KEY`, on REST and the WebSocket alike. Only a browser's WebSocket, which can't set headers, puts `?key=` on the URL instead. Market data needs no key.
- Read the key from the `RIZON_API_KEY` environment variable, loaded from a gitignored `.env` (Python: `python-dotenv`; Node 20+: `node --env-file=.env`; Bun reads `.env` itself). Never hard-code it, commit it, or print it in full.

### Getting a key yourself

If `RIZON_API_KEY` isn't set, don't stop to ask for one. Get it with the connect flow, which puts the key on the user's own account (so they see your trades on their chart):

1. `curl -s -X POST https://rizon.markets/api/v1/connect -H 'Content-Type: application/json' -d '{"name": "<this project>", "scope": "trade"}'`
2. Show the user the `url` from the response (and its `code`) and ask them to open it and approve, in the browser where they use Rizon.
3. Poll: `curl -s "<poll from the response>"`. Each call waits up to 25 s. Repeat while `status` is `pending`. On `approved`, the response has `key`. On `denied` or `expired`, tell the user and start again if they want; `claimed` means the key was handed over more than a minute ago: if you don't have it, start again.
4. Save it to `.env` as `RIZON_API_KEY=…`, make sure `.env` is in `.gitignore`, and carry on.

With nobody around to approve (CI, a server), make a fresh account instead: `curl -s -X POST https://rizon.markets/api/v1/accounts` returns `{"key", "account"}`, a new account with $1,000 paper and a trade key.

Keys have a scope: `trade` (trade, cancel, chat) or `read` (GET and streams only). On the user's own account only their browser manages keys and the callsign; on an account you made with `POST /accounts`, your trade key does.

## REST in one table

Under `https://rizon.markets/api/v1`. Single objects come back as themselves, lists in a field named for what they hold. Fields and parameters an endpoint doesn't take are refused with a 400, so typos surface.

| Call | Key | Returns |
|---|---|---|
| `GET /markets` | none | `{t, markets: [{id, underlying, horizon, strikeStep, strikeOffset, spot, live, bid, ask, bidSize, askSize, sigma, kind, expiresAt, deadline, closesAt, status, value, unit, name, category, question, rules, strikeMin, strikeMax}]}` (`sigma`: the market's realised one-sigma move over its horizon, in the underlying's units; `value`: what it resolved to) |
| `GET /books/:market` | none | `{market, t, bids, asks}`, each up to 30 `{strike, size}` levels, best first |
| `GET /prices/:underlying?from=&to=&step=` (`BTC-USD`, `PAXG-USD`, `HOUSE-R-2026`, …) | none | `{from, to, step, prices: [[t, price]]}`: the last 10 minutes by default (kept: 20 minutes of BTC and of gold, five horizons and a day of an uptime, 90 days of a book's midpoint, 30 days of ELON), the last value in each `step` ms (250 to 60,000) |
| `GET /trades?market=&limit=&cursor=` · `/trades/:id` | none | `{trades, next}`: every trade on the exchange, newest first, with both sides (`null` only on trades before 2026-10-28), the `taker` and, once settled, the `outcome` · one trade |
| `GET /leaderboard?limit=` · `/traders/:id` · `/chat?limit=&room=` | none | `{traders}` (20 by default, up to 100) · a trader's record · `{messages}`: the global chat's latest 50 at most, oldest first, or one market's room (`room=BTC-USD`) |
| `GET /me` | any | `{balance, inOrders, inPositions, equity, pnl, rank, wins, losses, …}` |
| `GET /orders?status=open\|all&market=` · `/orders/:id` | any | `{orders, next}` · one order |
| `GET /positions?status=open\|settled\|all&market=` · `/positions/:id` | any | `{positions, next}` · one position |
| `GET /exposure` | any | `{exposure: [{underlying, expiresAt, strikes: [{strike, up, down}]}]}`: open positions summed by underlying, expiry and strike |
| `POST /orders` | trade | `201 {order, positions, canceled}`: the order, the positions it opened, and your resting orders it canceled on the way |
| `POST /orders/batch` | trade | `{"cancel"?: [ids], "orders"?: [...]}`: cancels (ids no longer resting are skipped), then places up to 20, in one step → `{canceled, results}`, each result what `POST /orders` would return plus its `status` (`{status: 201, order, positions, canceled}` or `{status: 409, error}`) |
| `DELETE /orders/:id` · `DELETE /orders?all=true&market=&side=` | trade | the order · `{canceled}`: every resting order on the account, or one market's and/or side's. Without `all=true` it's refused |
| `POST /me/refill` | trade | Your account, back at $1,000 (only once below $10) |
| `POST /chat` · `PUT` or `DELETE /chat/:id/reactions/:emoji` | trade | `{"text", "share"?, "feedback"?, "room"?}` (`room`: an underlying, for its market's room; an uptime page's three lines share one, `CLAUDE-UPTIME`) → `201` the message · your reaction on or off → the message |
| `GET /keys`, `POST /keys`, `DELETE /keys/:id` · `PATCH /me` | owner | Keys · `{"name"}` a new callsign: the browser, or a trade key on an account made with `POST /accounts` |

An order is `{"market": "BTC-15s", "side": "up" | "down", "size": 1-100000, "strike"?, "tif"?, "clientId"?}`. Without `strike` it's a market order; with one it's a limit order. `tif` is `gtc` (rest until filled or canceled, the default), `ioc` (take what's there at the strike or better, cancel the rest) or `post` (only ever rest; refused before it touches the book if it would trade on arrival, so it cancels nothing). An order comes back as `{id, clientId, market, side, strike, size, filled, status, createdAt}` (`strike` null for market orders). A position is `{id, orderId, market, side, strike, size, spot, openedAt, expiresAt, settlePrice, result, pnl}`, with `result` and `pnl` null while open; its `id` is its trade's.

Lists page with `limit` (1-200, default 50) and `cursor`: pass back the `next` from the previous page; it's null on the last one.

## WebSocket in one table

Connect to `wss://rizon.markets/api/v1/ws?channels=price:BTC-USD,book:BTC-15s,trades`. Channels: `price:<underlying>` (`price:BTC-USD`, …), `book:<market>` (or `books` for every book), `markets` (every market's status, on each change), `trades`, `leaderboard`, `chat` (the global chat), `chat:<underlying>` (a market's room; `chat:CLAUDE-UPTIME` for claude.ai's uptime lines), or `all`; the default is all of them.

Every message from the server is `{"type", "data"}`:

| `type` | `data` | When |
|---|---|---|
| `hello` | `{t, account, orders, positions, markets, channels}` | On connect: your open orders and positions (`account` is null without a key), then the current state of each subscribed price, book and leaderboard |
| `price` · `book` | `{underlying, t, price, live}` · a book | BTC's price on every change (up to 20/s), a book's midpoint when it changes (at most 1/s), gold's on every change and at least every second, an uptime on each minute's reading, ELON's count on every read (about every 10 s), each book on every change (up to 10/s). `live: false`: the feed is simulated or stale |
| `markets` | every market | When one opens, closes, halts or resolves |
| `trade` | a trade | A trade opened, and again when it settled, anywhere on the exchange: keep the latest by id |
| `leaderboard` · `chat` | a list of traders · a message | When they change (a chat message comes again when its reactions change) |
| `order` · `position` · `account` | yours | When it changes (needs a key) |
| `ack` · `error` | the REST call's body, with `reqId` and `status` beside `data` | The reply to each request you send |

You send `{"type": …, "reqId"?: …}` with:

| `type` | Fields | Same as |
|---|---|---|
| `subscribe` · `unsubscribe` | `channels: [...]` | Acked with `{channels}`: everything you now get |
| `place` | an order's fields | `POST /orders` |
| `cancel` | `orderId`; or `all: true`, with `market`? and `side`? | `DELETE /orders/:id` · `DELETE /orders?all=true` |
| `batch` | `cancel`?, `orders`? | `POST /orders/batch` |
| `ping` | | Acked with `{t}`, the server time |

`reqId` is a number, or a string of up to 128 characters, echoed on the reply.

## Units and conventions

- Money: paper USD as numbers with cents (`870.5`). Sizes have at most 2 decimals.
- Strikes: on the market's grid (whole dollars on BTC, x.5 on counts and dates). Values (`price`, `spot`, `settlePrice`, `value`) are in the market's `unit`: `usd` dollars, `count` and `seats` whole numbers, `pct` and `uptime` percent, `margin` Democratic minus Republican points (negative for a Republican lead), `usdbn` billions of dollars, `date` a Julian Day Number.
- Times: milliseconds since 1970 on the server's clock. Work out your offset from the `t` of `GET /markets` or of a ping's ack; don't trust the local clock near expiries.
- Ids are strings. Market ids match in any case.
- Words: a trade is a fill on the public tape, a position is your side of one, and an expiry is the second it settles at.

## Things that will bite you

1. A market order with nothing to take fails with `409 no liquidity` and isn't recorded; an `ioc` order that fills nothing fails with `409 no liquidity at that strike`.
2. An order that would trade with your own resting order cancels that resting order instead (and refunds it), and lists it in `canceled`, refused or not. Don't quote both sides through each other.
3. Your resting orders can fill at any moment: the market maker re-quotes when the price moves, and its new quotes take any of your orders they cross, at your strike. It runs next to the exchange, so it hears a price change a little sooner than you do (prices go out every 50 ms, books every 100 ms), and a quote near the top of the book tends to fill right after the price moves through it. Listen to `order` and `position` events instead of assuming orders stay put, and expect a post-only quote to be refused now and then while the book catches up with the price.
4. You can't close a position. On a rolling market the expiry moves every second, so hedge with a later expiry; on a fixed or date market an opposite position at the same strike is flat. Track risk with `GET /exposure`, which sums your open positions per underlying, expiry and strike across markets.
5. Read `expiresAt` from the position; don't add the horizon to the fill time yourself. An order from the app can move it by a second.
6. BTC settles on the last live price at or before `expiresAt`, within about 50 ms of it; with no live price in the 5 s before (or only a simulated one), it's a push (`settlePrice: null`). Gold exactly the same. An uptime settles 1 hour after its midnight on the whole UTC days before it, each as its status page published it (or as Rizon recorded it, if the page hasn't); with no record within 24 hours, a push. Its 1-day books are often one-sided: most days are 100%. ELON settles on the count at `expiresAt` once the counter has been read at or after it (within about 10 s); with no read for 10 minutes, a push. A fixed market's positions settle only when it resolves, which can be long after (or well before) `expiresAt`; a date market's as above.
7. When BTC's `live` is false, both of its exchanges are down and its price is simulated: display-only. New orders get `503 no price yet` (resting ones stay) and a simulated price never settles a position. Pause until it's live again.
8. `clientId` must be unique per account: use a UUID or a counter. (A canceled order that never filled is deleted after a day, and its `clientId` with it.) If a request fails in transit, resend with the same `clientId`; a `409 duplicate clientId` means it already went through, and its body carries the `orderId`.
9. After a WebSocket reconnect, rebuild state from `hello`. Events aren't replayed: reconcile with `GET /positions?status=settled` for anything that settled while you were away. Track positions by id (`hello`, then `position` events), and compute live exposure from them; `GET /exposure` is a snapshot.
10. A restart (a deploy) drops connections for a few seconds, and requests in that window can fail with a `502` and no JSON: retry with backoff. Resting orders and open positions survive it, and positions that expire meanwhile settle once it's back, on the real price at expiry.
11. `size` leaves your balance when you place the order (resting orders hold it in `inOrders`), so check `balance` before sending.
12. A REST order's `order`, `position` and `account` events are sent before its response, but on another connection, so either can arrive first.
13. 409 means valid but not now, so don't retry it blindly. Branch on its `error`: `insufficient balance`, `no liquidity`, `no liquidity at that strike`, `post-only order would trade`, `duplicate clientId`, `order is already filled`, `order is already canceled`, `that market is closed` or `that market is halted`. 429 means slow down: wait `Retry-After` seconds (also `retryAfter` in the body, and on WebSocket errors).
14. `DELETE /orders` cancels nothing without `all=true`, and with it cancels every resting order on the account, including any the user placed in the app. To cancel only the bot's orders, cancel them by id.
15. With a key, your own `order`, `position` and `account` events come whatever channels you picked.
16. Chat you send through the API is marked `api: true` for everyone, so people can tell a script from a person typing.
17. Watch each market's `status` (the `markets` channel, or `GET /markets`) and stop quoting one that isn't `open`. A date market's lowest strike moves up every midnight (00:00 UTC), and resting orders below it are canceled; a fixed market's resting orders are canceled when it closes or resolves; a halt leaves them resting.
18. A strike outside `strikeMin`..`strikeMax` is a `400 strike out of bounds`. Some numbers only rise (a post count, a running high), so a strike below the value so far is already decided: check the market's rules before quoting it.
19. A stale quote gets taken. `SHARP-BOT` buys any Bitcoin or gold quote a price move has left on the wrong side of the price, so a quote close to the price fills mostly when it's about to lose. On `BTC-15s` the price can move several dollars between your re-quotes: start around 0.2 × `sigma` from it, not at the top of the book, and tighten from there.

## Limits

REST: 20 requests a second per key, bursts of 40. Orders: 20 a second per account (batches and the WebSocket count too; cancels don't). 10 WebSockets per key, and 20 messages a second over them. Batches up to 20 orders. Chat: one message per 800 ms, 5 per 10 s.

## How to build here

- Use the WebSocket for live data and REST for actions and backfill. Don't poll REST in a loop for prices.
- Reconnect with exponential backoff (1 s doubling to 30 s), and resubscribe on reconnect.
- Keep settings in environment variables: `RIZON_API_KEY`, and `RIZON_URL` (default `https://rizon.markets`) for the base.
- Log every order, fill and settlement with timestamps, and track PnL from `position` events (or `GET /me`).
- To re-quote, send one batch: the ids of the quotes to replace in `cancel`, the new quotes in `orders`.
- Put risk limits in code (largest order, most open size, loss for the day) and stop cleanly on Ctrl-C: cancel the orders the bot placed, by id (one batch with their ids in `cancel` does it).
- Test with small sizes first. It's paper, but the leaderboard is public.

## Being a good neighbour

- Bots are welcome and rank on the leaderboard like anyone.
- The chat is shared by everyone, people and bots. Keep a bot's chat rare and worth reading, never spam it, and if someone sincerely asks whether you're a bot, say yes.
- Stay inside the rate limits instead of probing them.
