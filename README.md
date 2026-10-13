# nigerian-reference-data-mcp

An [MCP](https://modelcontextprotocol.io) server that gives AI agents **pay-per-call Nigerian
reference data and validation** — no API key, no account, no signup. Each paid call settles in
**USDC** over [x402](https://x402.org) on Base or Polygon, so an agent can buy exactly what it needs,
one call at a time.

Built for agents doing Nigerian onboarding, form validation, routing and fraud screening — the checks
they currently cannot do, because the data is local.

## Install

Add to any MCP host (Claude Desktop, Cursor, Hermes, and anything else speaking MCP):

```json
{
  "mcpServers": {
    "nigerian-reference-data": {
      "command": "npx",
      "args": ["-y", "nigerian-reference-data-mcp"],
      "env": { "X402_PRIVATE_KEY": "0xYOUR_WALLET_KEY" }
    }
  }
}
```

`X402_PRIVATE_KEY` is optional. Set it and the server pays each x402 challenge automatically from
that wallet (which needs USDC on Base or Polygon — the facilitator covers the gas, so no native
token is required). Leave it out and paid tools return the live payment challenge instead of data,
so your host can settle it however it likes. The free tool works either way.

If your wallet holds USDC on a chain other than Base, set `X402_PREFER_NETWORKS` to the chain you
want to pay on, e.g. `eip155:137` for Polygon. Without it the server pays on Base.

## Tools

| Tool | Price | What it does |
|---|---|---|
| `ng_phone_lookup` | $0.003 | Normalise a Nigerian number (local, `+234`, `234…`), return E.164, line type, and network from the prefix allocation |
| `ng_bank_validate` | $0.003 | Validate a 10-digit NUBAN account number against its 3-digit CBN bank code (check-digit algorithm) |
| `ng_identity_format` | $0.002 | Format-check a NIN, BVN, TIN, CAC RC or CAC BN number |
| `ng_states` | **free** | All 36 states plus the FCT, with capitals |

Example — ask your agent: *"Is 08031234567 a valid Nigerian number, and which network is it on?"*

## What it deliberately does not do

**Format and reference validation only.** No personal data is returned, no identity database is
queried, and no account is confirmed to exist. Real NIN/BVN verification requires a
NIMC-licensed partner and is a separate thing entirely.

## HTTP API

The same endpoints are available directly over HTTP if you'd rather not use MCP:

- `GET /v1/ng/phone/lookup?number=08031234567` — $0.003
- `GET /v1/ng/bank/validate?bank_code=058&account_number=0123456789` — $0.003
- `GET /v1/ng/identity/format?type=NIN&value=12345678901` — $0.002
- `GET /v1/ng/states` — free

An unpaid call returns `402 Payment Required` with machine-readable terms in the `PAYMENT-REQUIRED`
header. Manifest: [`/llms.txt`](https://api.postandshare.net/llms.txt),
OpenAPI: [`/openapi.json`](https://api.postandshare.net/openapi.json).

## Licence

MIT.
