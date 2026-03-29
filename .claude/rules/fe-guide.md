# Frontend Rules

1. **TypeScript strict** — explicit prop types, `interface` for props, `import type` for type-only, no `any`
2. **Tailwind-first** — `dt-*` token classes, no static `style={{}}`, inline styles only for dynamic values
3. **Named exports** — no default exports except established entry points
4. **Icons** — `lucide-react` only
5. **Markdown** — `react-markdown` + `remark-gfm`, styled via `components` prop with `dt-*` tokens
6. **Costs** — `calculateTurnCost()` from `lib/cost.ts`. Update `MODEL_PRICING` in both server and dashboard when rates change
7. **No new UI frameworks** — use existing primitives before adding dependencies
8. **Names match capability** — a read-only viewer is "Viewer" not "Editor"
