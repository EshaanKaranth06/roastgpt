import { DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { HfInference } from "@huggingface/inference";
import "dotenv/config";

type SimilarityMetric = "dot_product" | "cosine" | "euclidean";

const ASTRA_DB_NAMESPACE = process.env.ASTRA_DB_NAMESPACE;
const ASTRA_DB_COLLECTION = process.env.ASTRA_DB_COLLECTION;
const ASTRA_DB_API_ENDPOINT = process.env.ASTRA_DB_API_ENDPOINT;
const ASTRA_DB_APPLICATION_TOKEN = process.env.ASTRA_DB_APPLICATION_TOKEN;
const HF_API_KEY = process.env.HF_API_KEY;

if (!ASTRA_DB_NAMESPACE || !ASTRA_DB_COLLECTION || !ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN || !HF_API_KEY) {
  throw new Error("Missing required environment variables.");
}

const MODEL = "intfloat/e5-large-v2";
const huggingfaceClient = new HfInference(HF_API_KEY);

const RData: string[] = [
  "https://parade.com/1105374/marynliles/good-comebacks/",
  "https://parade.com/1105374/marynliles/good-comebacks/#snarky-comebacks",
  "https://parade.com/1105374/marynliles/good-comebacks/#funny-comebacks",
  "https://en.wiktionary.org/wiki/Category:English_swear_words",
  "https://www.jumpspeak.com/blog/english-swear-words",
  "https://www.lingoda.com/blog/en/how-to-swear-in-english/",
  "https://www.buzzfeed.com/rorylewarne/british-swearwords-defined",
  "https://www.countryliving.com/life/entertainment/a62000506/ultimate-dark-humor-jokes/",
  "https://parade.com/1295709/marynliles/dark-humor-jokes/",
  "https://www.rd.com/article/dark-jokes/"
];

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE });

// Updated Text Splitter with smaller chunk size
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,  // Reduced chunk size to ensure it's under the limit
  chunkOverlap: 100,  // Optional: Adjust the overlap to keep context
});

const createCollection = async (similarityMetric: SimilarityMetric = "dot_product") => {
  try {
    await db.collection(ASTRA_DB_COLLECTION);
    console.log(`Collection '${ASTRA_DB_COLLECTION}' already exists. Skipping creation.`);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Collection not found")) {
      const res = await db.createCollection(ASTRA_DB_COLLECTION, {
        vector: {
          dimension: 1024,
          metric: similarityMetric,
        }
      });
      console.log(`Collection created: ${res}`);
    } else {
      throw error;
    }
  }
};

const loadSampleData = async () => {
  const collection = await db.collection(ASTRA_DB_COLLECTION);

  for await (const url of RData) {
    const existing = await collection.findOne({ url });
    if (existing) {
      console.log(`Skipping already processed URL(s): ${url}`);
      continue;
    }

    const content = await scrapePage(url);
    if (content) {
      const chunks = await splitter.splitText(content);  // Split content into smaller chunks

      for await (const chunk of chunks) {
        const output = await huggingfaceClient.featureExtraction({ model: MODEL, inputs: chunk });
        const vector = output as number[];

        const res = await collection.insertOne({
          $vector: vector,
          text: chunk,  // Store the smaller chunk of text
          url
        });
        console.log(res);
      }
    }
  }
};

const scrapePage = async (url: string): Promise<string | null> => {
  try {
    const loader = new PuppeteerWebBaseLoader(url, {
      launchOptions: { headless: true },
      gotoOptions: { waitUntil: "domcontentloaded" },
      evaluate: async (page, browser) => {
        const result = await page.evaluate(() => document.body.innerText);
        await browser.close();
        return result;
      },
    });
    const content = await loader.scrape();
    return content ? content.replace(/<[^>]*>?/gm, "") : null;
  } catch (error: unknown) {
    console.error(`Error scraping page ${url}:`, error);
    return null;
  }
};

(async () => {
  try {
    await createCollection();
    await loadSampleData();
  } catch (error: unknown) {
    console.error("Error in main execution:", error);
    process.exit(1);
  }
})();
