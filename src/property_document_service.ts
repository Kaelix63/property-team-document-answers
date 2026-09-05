import express from "express";
import { z, ZodError } from "zod";
import { InfraiRequestError, PropertyDocumentIndex } from "./infrai_document_index.js";

const questionSchema = z.object({
  propertyId: z.string().trim().min(1).max(80),
  question: z.string().trim().min(3).max(1000),
  topK: z.number().int().min(1).max(5).default(3),
}).strict();

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the property document service");

const index = new PropertyDocumentIndex(apiKey);
const service = express();
service.use(express.json({ limit: "24kb" }));

service.post("/questions", async (request, response) => {
  try {
    const input = questionSchema.parse(request.body);
    const result = await index.answer(input.propertyId, input.question, input.topK);
    response.status(200).json({ propertyId: input.propertyId, question: input.question, ...result });
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ error: "Invalid question", details: error.issues });
      return;
    }
    if (error instanceof InfraiRequestError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.status(status).json({ error: error.message, code: error.code });
      return;
    }
    response.status(500).json({ error: "The question could not be answered" });
  }
});

const port = Number(process.env.PORT ?? 3000);
service.listen(port, "127.0.0.1", () => {
  console.log(`Property document service listening on http://127.0.0.1:${port}`);
});
