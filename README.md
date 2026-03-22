# Claude DevTools

A comprehensive debugging and monitoring dashboard for Claude Code agents. Monitor agent execution flow, token usage, costs, tool invocations, and more in real-time.

## Features

- **Agent Flow Visualization**: Watch your agent's execution path in real-time as it processes tasks
- **Token Tracking**: Monitor input/output tokens and total consumption
- **Cost Analytics**: Track estimated API costs for your agent runs
- **Tool Monitoring**: See which tools are being called and their execution status
- **Command Input**: Test commands and invoke tools directly from the dashboard
- **Live Updates**: WebSocket-based real-time updates to the dashboard

## Installation

### As a Claude Code Plugin

1. Build the plugin (see Development below)
2. Install the `.plugin` file:
   ```bash
   cp claude-devtools.plugin ~/.claude/plugins/
   ```
3. Restart Claude Code
4. The dashboard will be available at `http://localhost:3142`

### From Source

```bash
npm install
npm run build
node dist/index.js
```

## Dashboard

The Claude DevTools dashboard provides:

- **Agent Execution Timeline**: Visual timeline of agent actions and tool calls
- **Token Metrics**: Real-time token counter showing input, output, and total tokens used
- **Cost Estimate**: Automatic cost calculation based on current Claude model pricing
- **Tool Registry**: Complete list of available tools and their schemas
- **Active Connections**: Monitor connected agent instances
- **Command Line**: Send commands to the agent and receive responses

### Dashboard Views

- **Timeline**: Sequential view of all agent actions
- **Tools**: Registered tools and their schemas
- **Metrics**: Token usage and cost analytics
- **Logs**: Detailed execution logs and debugging info

## Development

### Setup

```bash
# Install all dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Install dashboard dependencies
cd dashboard && npm install && cd ..
```

### Development Mode

Run both server and dashboard in development mode:

```bash
# In terminal 1: Start the server with hot reload
cd server && npm run dev

# In terminal 2: Start the dashboard with Vite dev server
cd dashboard && npm run dev
```

The dashboard will be available at `http://localhost:5173` (Vite dev server)
The MCP server will run on `http://localhost:3142`

### Building

```bash
# Build server and dashboard
npm run build

# This runs:
# - cd server && npm run build
# - cd dashboard && npm run build
# - Copies dashboard/dist to server/dist/public
```

## Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **MCP Protocol**: Model Context Protocol SDK for agent integration
- **Frontend**: React + Vite + TypeScript
- **WebSocket**: Real-time communication between server and dashboard
- **Styling**: TailwindCSS for UI components

## Project Structure

```
claude-devtools/
├── server/              # MCP server (Node.js/Express)
│   ├── src/
│   │   ├── index.ts    # MCP server entry point
│   │   ├── http/       # HTTP/WebSocket server
│   │   └── tools/      # Tool implementations
│   ├── dist/           # Compiled server
│   └── package.json
├── dashboard/          # React SPA dashboard
│   ├── src/
│   │   ├── App.tsx
│   │   └── components/ # React components
│   ├── dist/          # Built SPA
│   └── package.json
├── skills/            # Claude Code skills
├── .claude-plugin/    # Plugin manifest
├── .mcp.json         # MCP configuration
└── Makefile          # Build automation
```

## API

### MCP Tools

The server exposes tools through the Model Context Protocol:

- `list_agent_actions` - Get all recorded agent actions
- `get_metrics` - Current token and cost metrics
- `list_tools` - Available tools registry
- `invoke_tool` - Execute a tool directly

### WebSocket Events

Real-time events emitted to connected clients:

- `action_started` - Agent began an action
- `action_completed` - Agent completed an action
- `tool_called` - Tool was invoked
- `metrics_updated` - Token/cost metrics changed

## Troubleshooting

### Server won't start

Ensure all dependencies are installed:
```bash
cd server && npm install
cd ../dashboard && npm install
```

### Dashboard not loading

Check that the server is running and serving the SPA at `http://localhost:3142`

### WebSocket connection failures

Ensure your firewall allows connections to port 3142. Check browser console for detailed errors.

## License

MIT
