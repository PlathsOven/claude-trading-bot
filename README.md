# Claude trading bot

A starter trading bot for [Claude Code](https://claude.com/claude-code) and other coding agents: a small market maker on a live order book, with paper money, so a bad idea costs nothing. It trades on [Rizon](https://rizon.markets), a paper exchange with a public API. A key takes one call and there's no sign-up.

```sh
git clone https://github.com/PlathsOven/claude-trading-bot && cd claude-trading-bot
bun bot.ts
```

It makes an account with $1,000 of paper, saves the key to `.env`, posts a bid and an ask on Bitcoin's 15-second book, re-posts them as the price moves, and logs its fills and PnL every 10 seconds. Ctrl-C cancels its quotes.

**It will lose money at first.** [A bot on the exchange](https://rizon.markets/bots) picks off any quote a price move leaves stale, as fast traders do on real venues. Working out why you're losing, and fixing it, is the project.

## Build on it with Claude Code

`CLAUDE.md` tells an agent everything about the API, so open Claude Code in this folder and ask for what you want:

```text
Read bot.ts and CLAUDE.md. For each fill, log the price 1 and 5 seconds later, and print my realised spread: what I earned on the spread, net of how the price moved against me. Then tell me what's costing me the most.
```

Other things to ask for:

- Widen the quotes when volatility rises, using the market's `sigma`.
- Quote a Thanksgiving NFL book instead: `NFL-CHI-DET-TOTAL` is an over/under, and its midpoint is the line.
- Replace the market maker with a rule: momentum, mean reversion or your own, and compare it with [the public record](https://rizon.markets/bots).

## Or connect Claude directly

Rizon is also an MCP server, so Claude can read the books and trade paper money with no code:

```sh
claude mcp add --transport http rizon https://rizon.markets/mcp
```

## Settings

The top of `bot.ts` has what's worth changing first: `SIZE`, `WIDTH`, `SKEW_PER_100`, `MAX_LOSS`. `RIZON_API_KEY` uses a key you already have, from [rizon.markets/docs](https://rizon.markets/docs#keys).

## FAQ

**Is this real money?** No. Rizon is paper trading: no deposits, no withdrawals, nothing you can lose or win.

**Does it trade on Polymarket or Kalshi?** No. It's for finding out whether your idea works before you risk anything. Both publish trading APIs if you get that far: check that they're open to you where you live.

**Will it make money?** On paper, only if you find an edge. Claude writes code quickly; it doesn't hand you an edge. See [do trading bots work?](https://rizon.markets/learn/do-trading-bots-work)

**Can I use Python?** Yes: ask Claude to port it. `CLAUDE.md` covers the API, which is plain REST and a WebSocket.

## More

- [How to build a trading bot with Claude Code](https://rizon.markets/learn/how-to-build-a-trading-bot-with-claude-code)
- [A quant project for your resume](https://rizon.markets/learn/quant-project-for-resume)
- [prediction-market-maker](https://github.com/PlathsOven/prediction-market-maker): the much larger bots that quote Rizon's own books

MIT licensed.
