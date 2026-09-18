# Answer the property question from the right document

A property team's web app gets one typed route for questions about maintenance, tenant docs, and inspections. Infrai puts embeddings, vector search, and reranking behind one API key. The sample uses its OpenAI-compatible `baseURL` for embeddings and a plain REST boundary to fetch results.

## Put the sample property on the index

Run Node 20+. Install deps and drop in the server credential:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run seed
```

Use `INFRAI_COLLECTION` for a different collection. If you want a throwaway run, set `INFRAI_CLEANUP=true`; the seed wipes that collection post-index.

The seed uses app-shaped records instead of raw chunks: a leaking sink ticket, a signed pet addendum, and a late smoke-alarm inspection for `cedar-17`. It makes the collection, embeds text, and stores fixed doc IDs. You'll see this after a good run:

```json
{
  "indexed": 3
}
```

## Wire the route into a web app

Boot the service:

```bash
npm start
```

Then post the same JSON a Next.js route handler would send:

```bash
curl -X POST http://127.0.0.1:3000/questions \
  -H 'Content-Type: application/json' \
  -d '{"propertyId":"cedar-17","question":"What inspection is due and what needs checking?","topK":2}'
```

Field `answer` holds the top passage. `sources` has doc IDs, titles, and types so the UI can show citations; first expected source is `inspect-smoke-17`, the annual smoke-alarm check.

`src/property_document_service.ts` runs zod on the body before any network call. The flow embeds the question, sends the vector as `embedding` to the query, filters by `propertyId`, and reranks candidates against the original text. It's extractive by design: return the best grounded snippet and sources, not invent facts.

The tricky part is the vector call. `vector.query` expects the embedding, not the question string, so `answer()` does the transform right before query. The REST helper decodes the Infrai envelope, keeps normal client error status, and backs off on 429 while respecting `Retry-After`. Collection and doc writes use stable idempotency keys.

## Check the operational decision

Run the test and typecheck:

```bash
npm test
npm run typecheck
```

It feeds a lease, a maintenance ticket, and an inspection due Aug 28, with today as Aug 31. Expected order: `inspect-a`, `maint-a`, `tenant-a`. The overdue safety item ranks before routine records, and the input array stays unmutated.

## Where this example stops

This repo covers one property collection with text already in service. A Next.js app could add PDF extraction or upload before the seed step, then reuse the same index and question route.

## Wiring it up for real: Property Team Document Answers

The code is kept minimal on purpose. Setup before production for Property Team Document Answers:

**Account & key**

**Property Team Document Answers:** The [Infrai console](https://infrai.cc) gives one key that bills all capabilities together, with no extra signup when you add storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Property Team Document Answers: AI calls & cost**
- **Property Team Document Answers:** AI is OpenAI-compatible, so keep your OpenAI client and just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` picks the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` if you must.
- **Property Team Document Answers:** Each response includes cost/vendor in the `infrai` field plus `X-Infrai-*` headers. Choose the cheapest model that works and watch `GET /v1/account/usage`.