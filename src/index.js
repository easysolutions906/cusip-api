#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import * as cusip from './tools/cusip.js';
import * as isin from './tools/isin.js';
import { authMiddleware, createKey, revokeKey, PLANS, incrementUsage } from './keys.js';
import { createCheckoutSession, handleWebhook } from './stripe.js';

const server = new McpServer({
  name: 'mcp-cusip-isin',
  version: '1.0.0',
});

// --- CUSIP Tools ---

server.tool(
  'cusip_validate',
  'Validate a CUSIP (Committee on Uniform Securities Identification Procedures) number using the Luhn-variant check digit algorithm. Returns validity status and check digit details.',
  { cusip: z.string().describe('9-character CUSIP to validate (e.g., "037833100" for Apple Inc)') },
  async ({ cusip: code }) => ({
    content: [{ type: 'text', text: JSON.stringify(cusip.validate(code), null, 2) }],
  }),
);

server.tool(
  'cusip_parse',
  'Parse a CUSIP into its components: 6-character issuer code, 2-character issue number, and check digit. Also validates the check digit.',
  { cusip: z.string().describe('9-character CUSIP to parse (e.g., "037833100")') },
  async ({ cusip: code }) => ({
    content: [{ type: 'text', text: JSON.stringify(cusip.parse(code), null, 2) }],
  }),
);

// --- ISIN Tools ---

server.tool(
  'isin_validate',
  'Validate an ISIN (International Securities Identification Number) using the Luhn algorithm. Checks country code, format, and check digit.',
  { isin: z.string().describe('12-character ISIN to validate (e.g., "US0378331005" for Apple Inc)') },
  async ({ isin: code }) => ({
    content: [{ type: 'text', text: JSON.stringify(isin.validate(code), null, 2) }],
  }),
);

server.tool(
  'isin_parse',
  'Parse an ISIN into its components: country code, 9-character NSIN, and check digit. For US/CA ISINs, also extracts the embedded CUSIP.',
  { isin: z.string().describe('12-character ISIN to parse (e.g., "US0378331005")') },
  async ({ isin: code }) => ({
    content: [{ type: 'text', text: JSON.stringify(isin.parse(code), null, 2) }],
  }),
);

// --- Start ---

const TOOL_COUNT = 4;

const main = async () => {
  const port = process.env.PORT;

  if (port) {
    const app = express();
    app.use(express.json());

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    app.get('/', (_req, res) => {
      res.json({
        name: 'CUSIP/ISIN Validator',
        version: '1.0.0',
        description: 'Validate and parse CUSIP and ISIN security identifiers',
        tools: TOOL_COUNT,
        transport: 'streamable-http',
        plans: PLANS,
        endpoints: {
          'GET /cusip/validate': 'Validate a CUSIP number',
          'GET /isin/validate': 'Validate an ISIN number',
          'GET /cusip/parse': 'Parse CUSIP into components',
          'GET /isin/parse': 'Parse ISIN into components',
          'POST /validate/batch': 'Batch validate CUSIPs and ISINs',
        },
      });
    });

    // --- CUSIP endpoints ---

    app.get('/cusip/validate', authMiddleware, (req, res) => {
      const { cusip: code } = req.query;
      if (!code) {
        return res.status(400).json({ error: 'Missing required parameter: cusip' });
      }
      incrementUsage(req.identifier);
      res.json(cusip.validate(code));
    });

    app.get('/cusip/parse', authMiddleware, (req, res) => {
      const { cusip: code } = req.query;
      if (!code) {
        return res.status(400).json({ error: 'Missing required parameter: cusip' });
      }
      incrementUsage(req.identifier);
      res.json(cusip.parse(code));
    });

    // --- ISIN endpoints ---

    app.get('/isin/validate', authMiddleware, (req, res) => {
      const { isin: code } = req.query;
      if (!code) {
        return res.status(400).json({ error: 'Missing required parameter: isin' });
      }
      incrementUsage(req.identifier);
      res.json(isin.validate(code));
    });

    app.get('/isin/parse', authMiddleware, (req, res) => {
      const { isin: code } = req.query;
      if (!code) {
        return res.status(400).json({ error: 'Missing required parameter: isin' });
      }
      incrementUsage(req.identifier);
      res.json(isin.parse(code));
    });

    // --- Batch endpoint ---

    app.post('/validate/batch', authMiddleware, (req, res) => {
      const { cusips = [], isins = [] } = req.body;
      const totalItems = cusips.length + isins.length;

      if (totalItems === 0) {
        return res.status(400).json({ error: 'Provide at least one CUSIP or ISIN in the request body' });
      }

      if (totalItems > req.plan.batchLimit) {
        return res.status(400).json({
          error: `Batch size ${totalItems} exceeds your plan limit of ${req.plan.batchLimit}`,
          plan: req.planName,
        });
      }

      incrementUsage(req.identifier, totalItems);

      const results = {
        cusips: cusips.map((c) => cusip.validate(c)),
        isins: isins.map((i) => isin.validate(i)),
        summary: {
          total: totalItems,
          cusipsValid: 0,
          cusipsInvalid: 0,
          isinsValid: 0,
          isinsInvalid: 0,
        },
      };

      results.cusips.forEach((r) => {
        if (r.valid) { results.summary.cusipsValid++; }
        else { results.summary.cusipsInvalid++; }
      });

      results.isins.forEach((r) => {
        if (r.valid) { results.summary.isinsValid++; }
        else { results.summary.isinsInvalid++; }
      });

      res.json(results);
    });

    // --- Stripe checkout ---
    app.post('/checkout', async (req, res) => {
      try {
        const { plan, success_url, cancel_url } = req.body;
        const session = await createCheckoutSession(plan, success_url, cancel_url);
        res.json(session);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    // --- Stripe webhook ---
    app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
      try {
        const result = handleWebhook(req.body, req.headers['stripe-signature']);
        res.json({ received: true, result });
      } catch (err) {
        console.error('[webhook] Error:', err.message);
        res.status(400).json({ error: err.message });
      }
    });

    // --- Admin key management ---
    const adminAuth = (req, res, next) => {
      const secret = process.env.ADMIN_SECRET;
      if (!secret || req.headers['x-admin-secret'] !== secret) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    };

    app.post('/admin/keys', adminAuth, (req, res) => {
      const { plan, email } = req.body;
      const result = createKey(plan, email);
      res.json(result);
    });

    app.delete('/admin/keys/:key', adminAuth, (req, res) => {
      const revoked = revokeKey(req.params.key);
      res.json({ revoked });
    });

    // --- MCP transport ---
    const transports = {};

    app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      let transport = transports[sessionId];

      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };
        await server.connect(transport);
        transports[transport.sessionId] = transport;
      }

      await transport.handleRequest(req, res, req.body);
    });

    app.get('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      const transport = transports[sessionId];
      if (!transport) {
        res.status(400).json({ error: 'No active session. Send a POST to /mcp first.' });
        return;
      }
      await transport.handleRequest(req, res);
    });

    app.delete('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      const transport = transports[sessionId];
      if (!transport) {
        res.status(400).json({ error: 'No active session.' });
        return;
      }
      await transport.handleRequest(req, res);
    });

    app.listen(parseInt(port, 10), () => {
      console.log(`CUSIP/ISIN validator server running on HTTP port ${port}`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
};

main().catch((err) => {
  console.error('Failed to start CUSIP/ISIN server:', err);
  process.exit(1);
});
