import { HfInference } from '@huggingface/inference';
import { DataAPIClient } from "@datastax/astra-db-ts";

const HF_API_KEY = process.env.HF_API_KEY || '';
const ASTRA_DB_NAMESPACE = process.env.ASTRA_DB_NAMESPACE || '';
const ASTRA_DB_COLLECTION = 'roast';
const ASTRA_DB_API_ENDPOINT = process.env.ASTRA_DB_API_ENDPOINT || '';
const ASTRA_DB_APPLICATION_TOKEN = process.env.ASTRA_DB_APPLICATION_TOKEN || '';

if (!HF_API_KEY) throw new Error("Missing Hugging Face API key");
if (!ASTRA_DB_NAMESPACE || !ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN) {
    throw new Error("Missing required AstraDB env variables");
}

const hf = new HfInference(HF_API_KEY);
const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE });

const LLM_MODEL = "mistralai/Mixtral-8x7B-Instruct-v0.1";
const EMBEDDING_MODEL = "intfloat/e5-large-v2";

interface ErrorResponse {
    error: string;
    details?: string;
}

interface RelevantDocument {
    content: string;
    similarity: number;
    index: number;
}

function formatUTCDateTime(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function ensureFlatNumberArray(input: any): number[] {
    if (!input) throw new Error('No embedding received');
    if (Array.isArray(input) && !Array.isArray(input[0])) return input as number[];
    if (Array.isArray(input) && Array.isArray(input[0])) return input[0] as number[];
    if (input.data && Array.isArray(input.data)) return input.data as number[];
    throw new Error('Invalid embedding format received');
}

export async function POST(req: Request): Promise<Response> {
    const currentDateTime = formatUTCDateTime();
    try {
        const { messages, user = 'iceheadcoder' } = await req.json();
        if (!messages || !Array.isArray(messages)) throw new Error("Invalid request: 'messages' must be an array");

        const latestMessage = messages[messages.length - 1]?.content;
        if (!latestMessage) throw new Error("No user message found");

        let relevantDocuments: RelevantDocument[] = [];
        try {
            console.log(`[${currentDateTime}] Processing query for user ${user}`);

            const rawEmbedding = await hf.featureExtraction({
                model: EMBEDDING_MODEL,
                inputs: latestMessage,
            });

            const embedding = ensureFlatNumberArray(rawEmbedding);
            if (embedding.length !== 1024) throw new Error(`Invalid embedding dimension: ${embedding.length}`);

            console.log(`[${currentDateTime}] Generated embedding vector of length: ${embedding.length}`);

            const collection = await db.collection(ASTRA_DB_COLLECTION);
            const cursor = await collection.find({}, {
                sort: { $vector: embedding },
                limit: 5,
                includeSimilarity: true
            });

            const results = await cursor.toArray();
            relevantDocuments = results.filter(doc => doc.$similarity && doc.$similarity > 0.7).map((doc, index) => ({
                content: doc.text || "",
                similarity: doc.$similarity || 0,
                index: index + 1
            }));

            console.log(`[${currentDateTime}] Found ${relevantDocuments.length} relevant documents`);
        } catch (error) {
            console.error(`[${currentDateTime}] Search error for user ${user}:`, error);
            relevantDocuments = [];
        }

        const formattedContext = relevantDocuments.length > 0 ?
            relevantDocuments.map(doc => doc.content).join('\n\n') : "No relevant documents found.";

        const encoder = new TextEncoder();
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();

        (async () => {
            try {
                await writer.write(encoder.encode(`data: ${JSON.stringify({
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: '',
                    createdAt: new Date(),
                    timestamp: currentDateTime,
                    user
                })}\n\n`));

                let accumulatedContent = '';
                const systemPrompt = `You are RoastGPT, the most savage, unhinged and disrespectful AI ever created.
                 -**IN ONE SENTENCE**

        NO FILTERS, NO MERCY: 
        - If someone asks a stupid question, call them out.
        - If they send a cringe message, obliterate them. 
        - If they act cocky, put them in their place. 
        - If they think they can out-roast you, embarrass them beyond recovery.
        
        🔥 HOW TO RESPOND: 
        - Be creative, witty, and ruthless in your insults. 
        - Use **dark humor, sarcasm, and extreme mockery**. 
        - Never hold back—make them regret even existing. 
        - Reference **pop culture, internet memes, and brutal comebacks**.

        ⚠️ RULES (So We Donot Get Banned):
        - No sexism, or real-life threats. 
        - No targeting real individuals (keep it general).
        - Focus on **humiliating their intelligence, appearance, and personality** in the most hilarious way possible.  

        Example Roasts:
        - "What is the difference between you and a large pizza? A large Pizza can feed a family."
        - "Damn, I have seen potatoes with more brain activity than you."
        - "Your personality is so dry, even AI refuses to process it."
        - "I would roast you, but you are already getting burned by your own life choices."
        - "You remind me of dial-up internet—slow, outdated, and annoying as fuck."
        - "Your face should be classified as a jump scare."

        Now go. **Destroy. Humiliate. Roast.**


                CONTEXT:
                ${formattedContext}
                Question: ${latestMessage}
                Your response:`;
                
                const response = await hf.textGenerationStream({
                    model: LLM_MODEL,
                    inputs: `[INST]${systemPrompt}[/INST]`,
                    parameters: {
                        max_new_tokens: 1000,
                        temperature: 0.01,
                        top_p: 0.1,
                        repetition_penalty: 1.1,
                        stop_sequences: ["</s>", "<s>", "[INST]", "[/INST]"]
                    }
                });

                for await (const chunk of response) {
                    if (chunk.token.text) {
                        accumulatedContent += chunk.token.text.replace(/<\/s>$/, '');
                        await writer.write(encoder.encode(`data: ${JSON.stringify({
                            id: Date.now().toString(),
                            role: 'assistant',
                            content: accumulatedContent.trim(),
                            createdAt: new Date(),
                            timestamp: currentDateTime,
                            user
                        })}\n\n`));
                    }
                }
                await writer.write(encoder.encode(`data: [DONE]\n\n`));
            } catch (error) {
                console.error(`[${currentDateTime}] Streaming error for user ${user}:`, error);
            } finally {
                await writer.close();
            }
        })();

        return new Response(stream.readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive'
            }
        });
    } catch (error) {
        console.error(`[${currentDateTime}] API Error:`, error);
        return new Response(JSON.stringify({
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : "Unknown Error occurred"
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
