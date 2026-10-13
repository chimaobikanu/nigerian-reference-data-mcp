#!/usr/bin/env node
/**
 * MCP server — Nigerian reference data and validation for AI agents.
 *
 * Models Context Protocol server exposing pay-per-call Nigerian endpoints
 * (x402, USDC on Base and Polygon). No API key, no account: the server settles
 * each call automatically when a wallet key is configured, and otherwise returns
 * the live payment challenge for the host to handle.
 *
 * Configure in an MCP host:
 *   { "mcpServers": { "nigerian-reference-data": {
 *       "command": "npx", "args": ["-y", "nigerian-reference-data-mcp"],
 *       "env": { "X402_PRIVATE_KEY": "0x..." } } } }
 *
 * Env:
 *   AGENT_RAIL_URL    base URL of the API (default https://api.postandshare.net)
 *   X402_PRIVATE_KEY  optional EVM private key used to pay automatically
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { wrapFetchWithPayment } from '@x402/fetch';
import { x402Client } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const BASE = (process.env.AGENT_RAIL_URL || 'https://api.postandshare.net').replace(/\/$/, '');
const KEY = (process.env.X402_PRIVATE_KEY || '').trim();

let paidFetch = fetch;
let payingWallet = null;
if (KEY) {
  const account = privateKeyToAccount(KEY.startsWith('0x') ? KEY : `0x${KEY}`);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  // The SDK default selector is `accepts => accepts[0]` — it picks the FIRST offered network, so a
  // multi-network challenge silently routes the payment to whichever chain is listed first. That
  // fails for any wallet funded elsewhere, with no error explaining why. Prefer Base (the chain most
  // x402 buyers hold USDC on), overridable with X402_PREFER_NETWORKS.
  client.paymentRequirementsSelector = (v, accepts) => {
    const pref = (process.env.X402_PREFER_NETWORKS || 'eip155:8453')
      .split(',').map(s => s.trim()).filter(Boolean);
    for (const n of pref) { const a = accepts.find(x => x.network === n); if (a) return a; }
    return accepts[0];
  };
  paidFetch = wrapFetchWithPayment(fetch, client);
  payingWallet = account.address;
}

const decodeChallenge = (res) => {
  const hdr = res.headers.get('payment-required');
  if (!hdr) return null;
  try { return JSON.parse(Buffer.from(hdr, 'base64').toString('utf8')); } catch { return null; }
};

async function callPaid(path, params) {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const res = await paidFetch(url, { headers: { accept: 'application/json' } });
  if (res.status === 402) {
    const ch = decodeChallenge(res);
    const a = ch && ch.accepts && ch.accepts[0];
    return {
      paid: false,
      status: 402,
      message: KEY
        ? 'Payment was attempted but not accepted — check the wallet holds USDC on Base or Polygon.'
        : 'Payment required. Set X402_PRIVATE_KEY to a wallet holding USDC on Base or Polygon, or settle this challenge yourself.',
      price_usd: a ? Number(a.amount) / 1e6 : null,
      pay_to: a ? a.payTo : null,
      network: a ? a.network : null,
      challenge: ch,
    };
  }
  return { paid: true, status: res.status, data: await res.json().catch(() => null) };
}

const asText = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

const server = new McpServer({ name: 'nigerian-reference-data', version: '0.1.0' });

server.registerTool('ng_phone_lookup', {
  title: 'Nigerian phone number lookup',
  description: 'Validate a Nigerian phone number and return its normalised form, E.164, line type and network from the prefix allocation. $0.003 per call.',
  inputSchema: { number: z.string().describe('Nigerian number, e.g. 08031234567, +2348031234567 or 2348031234567') },
}, async ({ number }) => asText(await callPaid('/v1/ng/phone/lookup', { number })));

server.registerTool('ng_bank_validate', {
  title: 'Nigerian NUBAN account validation',
  description: 'Validate a Nigerian 10-digit bank account number against its 3-digit CBN bank code using the NUBAN check-digit algorithm. Format validation only — does not confirm the account exists. $0.003 per call.',
  inputSchema: {
    bank_code: z.string().describe('3-digit CBN bank code, e.g. 058 for GTBank'),
    account_number: z.string().describe('10-digit NUBAN account number'),
  },
}, async ({ bank_code, account_number }) => asText(await callPaid('/v1/ng/bank/validate', { bank_code, account_number })));

server.registerTool('ng_identity_format', {
  title: 'Nigerian identity number format check',
  description: 'Format-validate a Nigerian NIN, BVN, TIN, CAC RC or CAC BN number. Returns validity and normalised form only — no database lookup and no personal data. $0.002 per call.',
  inputSchema: {
    type: z.enum(['NIN', 'BVN', 'TIN', 'CAC_RC', 'CAC_BN']).describe('Which number type'),
    value: z.string().describe('The number to check'),
  },
}, async ({ type, value }) => asText(await callPaid('/v1/ng/identity/format', { type, value })));

server.registerTool('ng_states', {
  title: 'Nigerian states and capitals (free)',
  description: 'List all 36 Nigerian states plus the FCT with their capitals. Free — no payment required.',
  inputSchema: {},
}, async () => {
  const res = await fetch(`${BASE}/v1/ng/states`, { headers: { accept: 'application/json' } });
  return asText(await res.json().catch(() => ({ error: 'upstream error' })));
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`nigerian-reference-data MCP ready (base=${BASE}${payingWallet ? `, paying from ${payingWallet}` : ', no wallet configured'})`);
