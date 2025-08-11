import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
// Add Azure SDKs and multer
import multer from 'multer';
import { BlobServiceClient } from '@azure/storage-blob';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
// Azure AI Projects (Agents)
import { AIProjectClient } from '@azure/ai-projects';
import { DefaultAzureCredential } from '@azure/identity';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Configure Azure Blob Storage
const storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobContainerName = process.env.BLOB_CONTAINER_NAME || 'uploads';
let blobContainerClient = null;
if (storageConnectionString) {
  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
    blobContainerClient = blobServiceClient.getContainerClient(blobContainerName);
  } catch (e) {
    console.error('Blob Storage init error:', e.message);
  }
}

const upload = multer({ storage: multer.memoryStorage() });

// Upload files to Azure Blob Storage
app.post('/api/upload', upload.array('files'), async (req, res) => {
  try {
    if (!blobContainerClient) {
      return res.status(500).json({ error: { message: 'Blob storage not configured' } });
    }
    await blobContainerClient.createIfNotExists();

    const results = [];
    for (const file of req.files || []) {
      const blobName = `${Date.now()}-${file.originalname}`;
      const blockBlob = blobContainerClient.getBlockBlobClient(blobName);
      await blockBlob.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype }
      });
      results.push({ name: blobName });
    }
    return res.json({ uploaded: results.length, files: results });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: { message: 'Upload failed' } });
  }
});

// List blobs from existing Azure Blob Storage container (no upload required)
app.get('/api/blobs', async (req, res) => {
  try {
    if (!blobContainerClient) {
      return res.status(500).json({ error: { message: 'Blob storage not configured' } });
    }
    const exists = await blobContainerClient.exists();
    if (!exists) {
      return res.status(404).json({ error: { message: `Container ${blobContainerName} not found` } });
    }

    const prefix = (req.query.prefix || '').toString();
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);

    const blobs = [];
    for await (const blob of blobContainerClient.listBlobsFlat({ prefix })) {
      blobs.push({
        name: blob.name,
        size: blob.properties?.contentLength ?? null,
        contentType: blob.properties?.contentType ?? null,
        lastModified: blob.properties?.lastModified ?? null
      });
      if (blobs.length >= limit) break;
    }

    return res.json({ container: blobContainerName, prefix, count: blobs.length, blobs });
  } catch (err) {
    console.error('List blobs error:', err);
    return res.status(500).json({ error: { message: 'Failed to list blobs' } });
  }
});

// Stream/download a specific blob from the container
app.get('/api/blobs/:name(*)', async (req, res) => {
  try {
    if (!blobContainerClient) {
      return res.status(500).json({ error: { message: 'Blob storage not configured' } });
    }

    const name = req.params.name;
    const blobClient = blobContainerClient.getBlobClient(name);
    const exists = await blobClient.exists();
    if (!exists) {
      return res.status(404).json({ error: { message: 'Blob not found' } });
    }

    const downloadResp = await blobClient.download();
    if (downloadResp.contentType) res.setHeader('Content-Type', downloadResp.contentType);
    if (downloadResp.contentLength) res.setHeader('Content-Length', String(downloadResp.contentLength));
    res.status(200);

    if (downloadResp.readableStreamBody) {
      downloadResp.readableStreamBody.pipe(res);
    } else {
      // Fallback: no stream available
      res.end();
    }
  } catch (err) {
    console.error('Download blob error:', err);
    return res.status(500).json({ error: { message: 'Failed to download blob' } });
  }
});

// Configure Azure Cognitive Search
const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
const searchIndexName = process.env.AZURE_SEARCH_INDEX_NAME;
let searchClient = null;
if (searchEndpoint && searchApiKey && searchIndexName) {
  try {
    searchClient = new SearchClient(searchEndpoint, searchIndexName, new AzureKeyCredential(searchApiKey));
  } catch (e) {
    console.error('Search init error:', e.message);
  }
}

async function getSearchSnippets(query, top = 3) {
  if (!searchClient || !query) return [];
  const snippets = [];
  try {
    const results = searchClient.search(query, { top });

    // Prefer async iteration when available
    if (results && typeof results[Symbol.asyncIterator] === 'function') {
      for await (const item of results) {
        snippets.push(item.document);
        if (snippets.length >= top) break;
      }
      return snippets;
    }

    // Fallback: iterate pages if available
    if (results && typeof results.byPage === 'function') {
      for await (const page of results.byPage()) {
        const arr = page.results || page.value || [];
        for (const item of arr) {
          snippets.push(item.document);
          if (snippets.length >= top) break;
        }
        if (snippets.length >= top) break;
      }
      return snippets;
    }

    // Last resort: handle plain response shapes
    const resp = await results; // in case it's a Promise-like
    const arr = resp?.results || resp?.value || [];
    for (const item of arr) {
      snippets.push(item.document);
      if (snippets.length >= top) break;
    }
  } catch (e) {
    console.error('Search error:', e.message);
  }
  return snippets;
}

// Azure AI Projects (Agents) config
const aiProjectEndpoint = process.env.AI_PROJECT_ENDPOINT; // e.g. https://...services.ai.azure.com/api/projects/<projectName>
const aiAgentId = process.env.AI_AGENT_ID; // e.g. asst_XXXX
let aiProjectClient = null;
if (aiProjectEndpoint) {
  try {
    aiProjectClient = new AIProjectClient(aiProjectEndpoint, new DefaultAzureCredential());
  } catch (e) {
    console.error('AIProjectClient init error:', e.message);
  }
}

function nodeMajor() {
  const [maj] = process.versions.node.split('.').map(n => parseInt(n, 10));
  return maj;
}

// Quick health check to confirm env variables are loaded (does not expose secrets)
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    endpointConfigured: Boolean(process.env.AZURE_OPENAI_ENDPOINT),
    keyConfigured: Boolean(process.env.AZURE_OPENAI_API_KEY),
    blobConfigured: Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING),
    searchConfigured: Boolean(searchClient),
    agentConfigured: Boolean(aiProjectClient && aiAgentId),
    nodeVersion: process.versions.node
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: { message: 'messages must be an array' } });
    }

    // Use environment variables loaded by dotenv
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    if (!endpoint || !apiKey) {
      return res.status(500).json({ error: { message: 'Missing Azure OpenAI configuration' } });
    }

    // Retrieval step: use Azure Search context if configured
    const userQuery = messages[messages.length - 1]?.content || '';
    let ragContext = '';
    let docs = [];
    if (searchClient && userQuery) {
      docs = await getSearchSnippets(userQuery, 3);
      if (docs.length) {
        const joined = docs
          .map((d, i) => {
            const text = d.content || d.text || d.chunk || d.pageContent || JSON.stringify(d).slice(0, 800);
            return `Doc ${i + 1}: ${text}`;
          })
          .join('\n---\n');
        ragContext = `Context (knowledge base) below. Prefer this for grounding. If irrelevant, say you don't know.\n${joined}`.slice(0, 3500);
        console.log(`Knowledge base used: ${docs.length} doc(s)`);
      }
    } else if (!searchClient) {
      // Helpful log for troubleshooting why KB isn’t showing up
      console.log('Knowledge base not configured (Azure Search client is null).');
    }

    // Clear, single system prompt that instructs how to mark KB usage in the reply
    const systemPrompt = [
      'You are a helpful, concise assistant.',
      'If knowledge base "Context" is provided, use it to answer.',
      'If you relied on the provided Context for your answer, start your first line with: [KB] ',
      'If the provided Context was missing or irrelevant, start with: [No KB] and answer from general knowledge if appropriate; if you do not know, say you do not know.',
    ].join(' ');

    const augmentedMessages = [
      { role: 'system', content: systemPrompt },
      ...(ragContext ? [{ role: 'system', content: ragContext }] : []),
      ...messages
    ];

    const azureResp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        messages: augmentedMessages,
        max_tokens: 256
      })
    });

    const data = await azureResp.json();

    // Expose KB usage via headers and response meta without breaking existing payload shape
    const kbUsed = Boolean(docs && docs.length);
    res.setHeader('x-knowledge-base-used', String(kbUsed));
    res.setHeader('x-knowledge-base-doc-count', String(docs?.length || 0));

    const responseBody = (data && typeof data === 'object')
      ? { ...data, meta: { kbUsed, kbDocCount: docs?.length || 0 } }
      : data;

    return res.status(azureResp.ok ? 200 : azureResp.status).json(responseBody);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: { message: 'Server error' } });
  }
});

// Agents endpoint (Azure AI Projects)
app.post('/api/agent', async (req, res) => {
  try {
    if (!aiProjectClient || !aiAgentId) {
      return res.status(500).json({ error: { message: 'Agent not configured. Set AI_PROJECT_ENDPOINT and AI_AGENT_ID.' } });
    }
    if (nodeMajor() < 20) {
      console.warn('Warning: @azure/ai-projects requires Node >= 20. Current:', process.versions.node);
    }

    const prompt = (req.body && (req.body.prompt || req.body.message || req.body.text)) || '';
    if (!prompt) {
      return res.status(400).json({ error: { message: 'prompt is required' } });
    }

    // Retrieve agent
    const agent = await aiProjectClient.agents.getAgent(aiAgentId);

    // Create thread
    const thread = await aiProjectClient.agents.threads.create();

    // Create message
    await aiProjectClient.agents.messages.create(thread.id, 'user', prompt);

    // Create run
    let run = await aiProjectClient.agents.runs.create(thread.id, agent.id);

    // Poll for completion
    while (run.status === 'queued' || run.status === 'in_progress') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      run = await aiProjectClient.agents.runs.get(thread.id, run.id);
    }

    if (run.status === 'failed') {
      return res.status(500).json({ error: { message: 'Agent run failed', details: run.lastError } });
    }

    // List messages
    const messages = [];
    const iter = await aiProjectClient.agents.messages.list(thread.id, { order: 'asc' });
    for await (const m of iter) {
      const content = m.content?.find((c) => c.type === 'text' && 'text' in c);
      if (content) {
        messages.push({ role: m.role, text: content.text.value });
      }
    }

    return res.json({ status: run.status, messages });
  } catch (error) {
    console.error('Agent error:', error);
    return res.status(500).json({ error: { message: 'Agent endpoint error', details: error?.message } });
  }
});

app.listen(port, () => {
  const endpointSet = Boolean(process.env.AZURE_OPENAI_ENDPOINT);
  const keySet = Boolean(process.env.AZURE_OPENAI_API_KEY);
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Azure config - endpoint: ${endpointSet}, apiKey: ${keySet}`);
  if (aiProjectClient) {
    console.log('AI Projects client configured. Agent ID set:', Boolean(aiAgentId));
  }
  if (nodeMajor() < 20) {
    console.warn(`Warning: Node ${process.versions.node} detected. @azure/ai-projects requires Node >= 20.`);
  }
});
