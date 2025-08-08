import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Quick health check to confirm env variables are loaded (does not expose secrets)
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    endpointConfigured: Boolean(process.env.AZURE_OPENAI_ENDPOINT),
    keyConfigured: Boolean(process.env.AZURE_OPENAI_API_KEY)
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

    const azureResp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        messages,
        max_tokens: 256
      })
    });

    const data = await azureResp.json();
    return res.status(azureResp.ok ? 200 : azureResp.status).json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: { message: 'Server error' } });
  }
});

app.listen(port, () => {
  const endpointSet = Boolean(process.env.AZURE_OPENAI_ENDPOINT);
  const keySet = Boolean(process.env.AZURE_OPENAI_API_KEY);
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Azure config - endpoint: ${endpointSet}, apiKey: ${keySet}`);
});
