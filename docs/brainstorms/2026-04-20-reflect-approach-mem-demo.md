# Brainstorm: Reflect on Approach — Token Savings Demo

**Date:** 2026-04-20
**Input type:** Observation
**Input:** reflect our approach (to demonstrating Token Savior + claude-mem token savings)

## Root Cause
Approach was backwards: designed feature first, tried to find data second.
No claude-mem tool call has been found in any JSONL session yet.

## Right Order
1. Get a real JSONL snippet where claude-mem fired
2. Confirm exact tool name prefix
3. Then design the dashboard feature around actual data

## Blocker
Need: exact MCP tool name for claude-mem (check localhost:37777 or plugin config)
