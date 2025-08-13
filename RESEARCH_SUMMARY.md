# 📘 Azure AI Research Summary

## 🔐 Data Privacy

Microsoft Azure AI ensures customer data privacy. See official docs:

- https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy?tabs=azure-portal

## 🧠 Knowledge Base Strategies

### RAG (Retrieval-Augmented Generation)

Enhances responses by pulling relevant chunks from external data at query time.

- ✅ Real-time grounding on changing data
- ✅ Good for heterogeneous content stores (docs, blobs)
- ⚠️ Requires pipeline (ingest, index, embed, retrieve)
- ⚠️ Latency slightly higher due to retrieval round trip

### CAG (Cache-Augmented Generation)

Preloads contextual knowledge in fast-access memory or layer.

- ✅ Very low latency responses
- ✅ Cost-efficient: smaller model + cached facts
- ✅ Stable for static / rarely-changing domains
- ⚠️ Needs refresh process when content changes

### Built-in Q&A / Knowledge Base (Azure Language Service)

- Provides custom question answering over ingested sources (files, URLs, FAQs).
- Faster to start, less control over retrieval pipeline.
- Docs: https://learn.microsoft.com/en-us/azure/ai-services/language-service/question-answering/overview

## 🚦 Rate Limiting & Governance

Use Azure API Management in front of your chatbot or ingestion APIs to:

- Enforce per-subscription or per-IP quotas
- Add caching & transformation policies
- Centralize authentication (OAuth / subscription keys)
  Product: https://azure.microsoft.com/en-us/products/api-management

## 🔊 Speech & Localization

A Cantonese voice model is available in Azure Speech (for TTS / voice experiences).

- Voice gallery: https://speech.microsoft.com/portal/voicegallery

## 🧩 Vector & RAG Implementation Notes

Key docs:

- Vector import / quickstart (portal): https://learn.microsoft.com/zh-tw/azure/search/search-get-started-portal-import-vectors?tabs=sample-data-storage%2Cmodel-aoai%2Cconnect-data-storage
- RAG Concepts: https://learn.microsoft.com/en-us/azure/ai-foundry/concepts/retrieval-augmented-generation
- Vector ranking: https://learn.microsoft.com/zh-tw/azure/search/vector-search-ranking
- RAG overview: https://learn.microsoft.com/en-us/azure/search/retrieval-augmented-generation-overview?tabs=docs

### Typical Azure RAG Flow

1. Ingest files (PDF, MD, TXT) into Blob Storage.
2. Indexer or pipeline extracts text → chunk & embed.
3. Store chunks + vector embeddings in Azure AI Search index (fields: id, content, embedding, metadata).
4. Query time: generate embedding for user query → hybrid search (vector + keyword) → top-k docs.
5. Construct context window (deduplicate, trim tokens) → feed to model.
6. Post-process (citations, hallucination guard, answer tagging).

### Index Field Suggestions

| Field       | Type                               | Purpose               |
| ----------- | ---------------------------------- | --------------------- |
| id          | Edm.String (key)                   | Unique chunk id       |
| content     | Edm.String (searchable)            | Chunk text            |
| embedding   | Collection(Double)                 | Vector for similarity |
| source      | Edm.String (filterable, facetable) | Origin file name      |
| lastUpdated | Edm.DateTimeOffset                 | Freshness checks      |
| tags        | Collection(Edm.String)             | Filtering / facets    |
