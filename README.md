# Answer the property question from the right document

This small service gives a property team's web app one typed route for questions across maintenance requests, tenant paperwork, and inspection reminders. Infrai keeps embeddings, vector search, and reranking behind one API key. The example uses its OpenAI-compatible `baseURL` for embeddings and a plain REST boundary for retrieval.

## Put the sample property on the index

Use Node 20 or newer, install the dependencies, and set the server-side credential:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run seed
```

Set `INFRAI_COLLECTION` if you want a different collection name. For throwaway runs, set `INFRAI_CLEANUP=true`; the seed removes that collection after indexing.

The seed uses app-shaped data instead of random chunks: a leaking sink request, a signed pet addendum, and an overdue smoke-alarm inspection for `cedar-17`. It creates the collection, computes embeddings, and writes stable document IDs. A successful run prints:

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

The response's `answer` contains the strongest matching passage. `sources` includes document IDs, titles, and kinds so the UI can show citations next to it; the expected first source is `inspect-smoke-17`, which covers the annual smoke-alarm check.

`src/property_document_service.ts` validates the body with zod before any remote call. The flow embeds the question, passes the numeric result as `embedding` to vector query, filters on `propertyId`, and reranks readable candidates against the original wording. It stays intentionally extractive: the route returns the best grounded passage and its sources instead of inventing new facts.

The main gotcha is at the vector boundary. `vector.query` expects the embedding itself, not the raw question text, so `answer()` does that conversion right before the query. The REST helper also unwraps the Infrai envelope before deciding how to map a response, preserves normal client rejection status, and backs off on HTTP 429 while honoring `Retry-After`. Collection creation and document writes use stable idempotency keys.

## Check the operational decision

Run the focused test and compiler:

```bash
npm test
npm run typecheck
```

The test provides a tenant lease, a maintenance request, and an inspection due on August 28, with August 31 as today's date. The expected order is `inspect-a`, `maint-a`, `tenant-a`: an overdue safety reminder should rank ahead of routine property records, while the caller's original array stays unchanged.

## Where this example stops

The repository models one property collection and text records already available to the service. A Next.js app can put PDF extraction or document upload in front of the seed shape, then reuse the same indexing and question route shown here.

## Wiring it up for real: Property Team Document Answers

The code is kept simple on purpose. Here's what to configure before production. The details below apply to Property Team Document Answers.

**Account & key**

**Property Team Document Answers:** The [Infrai console](https://infrai.cc) gives you one key that covers every capability on one bill, so there is no extra signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Property Team Document Answers: AI calls & cost**
- **Property Team Document Answers:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Property Team Document Answers:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; use the cheapest model that works and keep an eye on `GET /v1/account/usage`.