# MCP CUSIP/ISIN Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for validating and parsing CUSIP and ISIN security identifiers using check digit algorithms.

## Tools (4 total)

| Tool | Description |
|------|-------------|
| `cusip_validate` | Validate a 9-character CUSIP using the Luhn-variant check digit algorithm |
| `cusip_parse` | Parse a CUSIP into issuer code, issue number, and check digit |
| `isin_validate` | Validate a 12-character ISIN using the Luhn algorithm |
| `isin_parse` | Parse an ISIN into country code, NSIN, and check digit (extracts embedded CUSIP for US/CA) |

## Install

```bash
npx @easysolutions906/mcp-cusip-isin
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cusip-isin": {
      "command": "npx",
      "args": ["-y", "@easysolutions906/mcp-cusip-isin"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cusip-isin": {
      "command": "npx",
      "args": ["-y", "@easysolutions906/mcp-cusip-isin"]
    }
  }
}
```

## REST API

Set `PORT` env var to run as an HTTP server.

- `GET /cusip/validate?cusip=037833100` -- validate a CUSIP
- `GET /cusip/parse?cusip=037833100` -- parse CUSIP into components
- `GET /isin/validate?isin=US0378331005` -- validate an ISIN
- `GET /isin/parse?isin=US0378331005` -- parse ISIN into components
- `POST /validate/batch` -- batch validate multiple CUSIPs and ISINs

## Data Source

Pure algorithm -- no external dataset required. CUSIP uses a Luhn-variant checksum; ISIN uses standard Luhn over letter-to-number conversion.

## Transport

- **stdio** (default) -- for local use with Claude Desktop and Cursor
- **HTTP** -- set `PORT` env var to start in Streamable HTTP mode on `/mcp`
