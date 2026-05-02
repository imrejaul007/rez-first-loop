# rez-first-loop

First closed loop: Inventory → Reorder automation. Worker-only service.

## Loop Flow
1. `inventory.low` event fires (stock < threshold)
2. Event Platform routes to this service
3. Action Engine decides action (draft_po / notify / escalate)
4. If `draft_po`: creates draft PO in NextaBiZ
5. Merchant approves/rejects → feedback recorded
6. AdaptiveScoringAgent learns

## Build
```bash
npm run build && npm start
```

## Key Files
- `src/orchestrator.ts` — first loop worker processing `inventory.low` events

## Env Vars
`MONGODB_URI`, `REDIS_URL`, `INTERNAL_SERVICE_TOKENS_JSON`, `SENTRY_DSN`, `REZ_ACTION_ENGINE_URL`, `REZ_FEEDBACK_SERVICE_URL`, `NEXTABIZ_URL`
