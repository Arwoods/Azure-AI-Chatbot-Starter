# 🤖 Azure AI Chatbot Starter (Express + RAG + Agents)

A minimal Node.js/Express backend that powers a web chat using:

- ☁️ Azure OpenAI (Chat Completions)
- 🔎 Azure AI Search for Retrieval-Augmented Generation (RAG)
- 📦 Azure Blob Storage for file upload/list/download
- 🧑‍💼 Azure AI Projects (Agents) endpoint

It also clearly indicates when knowledge-base context was used in answers.

---

## ✨ Features

- 🧠 RAG: Augments user prompts with top search snippets from Azure AI Search
- 🏷️ Reply tagging: Assistant starts responses with [KB] or [No KB]
- 🧾 Response metadata: Adds headers and JSON meta to show KB usage
- 📁 File handling: Upload to and read from Azure Blob Storage
- 🧵 Agents: Simple endpoint to run an Azure AI Projects Agent
- 🩺 Health check: Quick configuration status endpoint

---

## 🧰 Tech Stack

- Node.js (ES Modules) + Express
- Azure SDKs: `@azure/search-documents`, `@azure/storage-blob`, `@azure/ai-projects`, `@azure/identity`
- `multer` for in-memory uploads, `node-fetch` for HTTP

> Note: `@azure/ai-projects` requires Node 20+. The rest runs on Node 18+, but Node 20 LTS is recommended.

---

## 🚀 Getting Started

### 1) Prerequisites

- Node.js 20+ (recommended)
- Azure resources as needed:
  - Azure OpenAI (a chat deployment)
  - Azure AI Search (index populated with your content)
  - Azure Storage (container for uploads) — optional
  - Azure AI Projects (Agent) — optional

### 2) Install

```bash
npm install
```

### 3) Configure environment

Create a `.env` file in the project root with the keys you use:

```bash
# Azure OpenAI (Chat Completions REST endpoint)
# Example: https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-02-15-preview
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=

# Azure Blob Storage (optional for uploads/list/download)
AZURE_STORAGE_CONNECTION_STRING=
BLOB_CONTAINER_NAME=uploads

# Azure AI Search (for RAG)
AZURE_SEARCH_ENDPOINT=
AZURE_SEARCH_API_KEY=
AZURE_SEARCH_INDEX_NAME=

# Azure AI Projects (Agents) — optional
# Example: https://<region>.services.ai.azure.com/api/projects/<projectName>
AI_PROJECT_ENDPOINT=
AI_AGENT_ID=
```

### 4) Run

```bash
npm start
```

Open http://localhost:3000 to load `index.html` served by Express.

---

## 🔌 API Endpoints

### GET /api/health

Returns a basic status of which services are configured.

### POST /api/chat

- Body: `{ messages: [{ role: 'user' | 'system' | 'assistant', content: string }, ...] }`
- Behavior:
  - If Azure AI Search is configured, the service retrieves top snippets and augments the prompt.
  - The assistant is instructed to prefix with `[KB]` when KB context was used or `[No KB]` otherwise.
- Extra response details:
  - Headers:
    - `x-knowledge-base-used: 'true' | 'false'`
    - `x-knowledge-base-doc-count: <number>`
  - JSON:
    - Adds `meta: { kbUsed: boolean, kbDocCount: number }` to the response object.

Example:

```bash
curl -s \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"What does our warranty cover?"}]}' \
  http://localhost:3000/api/chat
```

### POST /api/upload

Multipart upload of one or more files. Stored in the configured Blob container.

```bash
curl -F 'files=@./docs/handbook.pdf' -F 'files=@./notes.txt' http://localhost:3000/api/upload
```

### GET /api/blobs

List blobs (supports optional `prefix` and `limit`).

```bash
curl 'http://localhost:3000/api/blobs?prefix=&limit=50'
```

### GET /api/blobs/:name

Stream/download a specific blob.

```bash
curl -L 'http://localhost:3000/api/blobs/my-file.pdf' -o my-file.pdf
```

### POST /api/agent

Runs a prompt through an Azure AI Projects Agent (requires Node 20+).

- Body: `{ prompt: string }`

```bash
curl -s -H 'Content-Type: application/json' \
  -d '{"prompt":"Summarize our onboarding policy."}' \
  http://localhost:3000/api/agent
```

---

## 🧠 Knowledge Base (RAG) Details

- The server searches your Azure AI Search index and injects a compact context.
- The model is instructed to start the first line with:
  - `[KB]` when it relied on the injected context
  - `[No KB]` when no relevant context was used
- You can also programmatically detect this via the response headers and `meta` fields described above.

Tips for best results:

- Ensure the index contains a textual field like `content` (fallbacks: `text`, `chunk`, `pageContent`).
- Keep chunks concise but meaningful (512–1536 tokens).

---

## 🛠️ Development Notes

- Static files are served from the project root (so `index.html` loads at `/`).
- If you don’t use Search/Blob/Agents, leave those env vars empty; endpoints will respond with helpful errors.
- Logs will indicate when the knowledge base is used and how many documents were injected.

---

## ❓ Troubleshooting

- No KB used in responses:
  - Check `/api/health` → `searchConfigured: true`
  - Verify `AZURE_SEARCH_*` values and that your index has documents
- Agent endpoint fails:
  - Use Node 20+; confirm `AI_PROJECT_ENDPOINT` and `AI_AGENT_ID`
- OpenAI errors:
  - Ensure `AZURE_OPENAI_ENDPOINT` is the full Chat Completions URL and API key is valid

---

## 📄 License

ISC
