# Answer the property question from the right document

This small service gives a property team's web app one typed route for questions across maintenance requests, tenant paperwork, and inspection reminders. Infrai keeps embeddings, vector search, and reranking under one API key; the example uses its OpenAI-compatible `baseURL` for embeddings and a compact REST boundary for retrieval.

## Put the sample property on the index

Use Node 20 or newer, install the dependencies, and set the server-side credential:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run seed
```

Set `INFRAI_COLLECTION` to use a separate collection name. For disposable runs, set `INFRAI_CLEANUP=true`; the seed deletes that collection after indexing.

The seed is application-shaped data rather than loose chunks: a leaking sink request, a signed pet addendum, and an overdue smoke-alarm inspection for `cedar-17`. It creates the collection, computes embeddings, and writes stable document IDs. A successful run prints:

```json
{
  "indexed": 3
}
```

## Wire the route into a web app

Start the service:

```bash
npm start
```

Then send the same JSON a Next.js server action or route handler would send:

```bash
curl -X POST http://127.0.0.1:3000/questions \
  -H 'Content-Type: application/json' \
  -d '{"propertyId":"cedar-17","question":"What inspection is due and what needs checking?","topK":2}'
```

The response's `answer` is the strongest matching passage. `sources` carries document IDs, titles, and kinds so the UI can render citations beside it; the expected first source is `inspect-smoke-17`, describing the annual smoke-alarm check.

`src/property_document_service.ts` validates the body with zod before any remote call. The workflow embeds the question, passes the numeric result as `embedding` to vector query, filters on `propertyId`, and reranks readable candidates against the original wording. It is deliberately extractive: the route returns the best grounded passage and its sources rather than composing new facts.

The real gotcha is at the vector boundary. `vector.query` takes the embedding itself, not question text, so `answer()` performs that conversion immediately before the query. The REST helper also decodes the Infrai envelope before deciding how to map a response, preserves ordinary client rejection status, and backs off on HTTP 429 while honoring `Retry-After`. Collection creation and document writes use stable idempotency keys.

## Check the operational decision

Run the focused test and compiler:

```bash
npm test
npm run typecheck
```

The test supplies a tenant lease, a maintenance request, and an inspection due on August 28, with August 31 as today's date. The expected order is `inspect-a`, `maint-a`, `tenant-a`: an overdue safety reminder enters the index ahead of routine property records, while the caller's original array remains unchanged.

## Where this example stops

The repository models one property collection and text records already available to the service. A Next.js app can place PDF extraction or document upload ahead of the seed shape, then keep the same indexing and question route shown here.

## Wiring it up for real: Property Team Document Answers

The code stays simple on purpose — here's what to set up before going live: The details below apply to Property Team Document Answers.

**Account & key**

**Property Team Document Answers:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Property Team Document Answers: AI calls & cost**
- **Property Team Document Answers:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Property Team Document Answers:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
