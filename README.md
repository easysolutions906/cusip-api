# CUSIP/ISIN Validator API + MCP Server

Validate and parse CUSIP and ISIN security identifiers. Pure algorithm — no external data needed.

## Endpoints

- `GET /` — API info
- `GET /health` — health check
- `GET /cusip/validate?cusip=037833100` — validate a CUSIP
- `GET /isin/validate?isin=US0378331005` — validate an ISIN
- `GET /cusip/parse?cusip=037833100` — parse CUSIP into components
- `GET /isin/parse?isin=US0378331005` — parse ISIN into components
- `POST /validate/batch` — batch validate multiple CUSIPs/ISINs

## MCP Transport

- **Stdio**: run without `PORT` env var
- **Streamable HTTP**: set `PORT` env var, connect to `/mcp`

## Local Development

```bash
npm install
npm run dev
```

## Deploy

```bash
# Railway
railway up
```
