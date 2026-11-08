# Providers

Anything reachable over HTTP can be a provider. You need a base URL, usually a key, and a model ID.

## Add a custom API

1. Open **Settings > Providers > Add provider**, or press Ctrl+K and search for it.
2. Choose **Custom API**, enter a name, and leave **OpenAI-compatible API** on if your API follows that format.
3. Enter the base URL, for example `https://api.example.com/v1`. NEXA builds the endpoint and shows it, so you never type `/chat/completions`. Pasting the full endpoint works too.
4. Paste the key.
5. Enter the model ID, or use **Browse** to fetch the provider's list.
6. Test the connection, then choose **Done**.

For example:

| Field | Value |
| --- | --- |
| Provider name | Keryos |
| Base URL | `https://api.example.com/v1` |
| API key | `sk-xxxxxxxx` |
| Model | `anthropic/claude-opus-4-7` |

## API types

| Type | Endpoint | Auth |
| --- | --- | --- |
| OpenAI Compatible | `POST {base}/chat/completions` | `Authorization: Bearer` |
| Anthropic Compatible | `POST {base}/messages` | `x-api-key`, `anthropic-version` |
| Google Gemini | `POST {base}/models/{id}:streamGenerateContent?alt=sse` | `x-goog-api-key` |
| OpenRouter | OpenAI format, plus attribution headers and model metadata | `Authorization: Bearer` |
| Custom HTTP | You define it | You define it |

## Advanced options

Available under **Advanced options** in the connection step.

| Option | Use |
| --- | --- |
| Headers | Extra headers such as `HTTP-Referer`, `X-Title` or `api-key`. The lock icon stores a value encrypted. |
| Query parameters | Added to every request, for example `api-version=2024-10-21`. |
| Endpoint path | Replaces the default path. |
| Model list path | For a list at a non-standard address. |
| HTTP method | POST or PUT. |
| Authentication | Bearer, API key header, Basic (`user:password`), custom header and prefix, or none. |

### Custom HTTP

For APIs that follow no standard, describe the request and where the text is.

**Request body** is a JSON template with these placeholders:

```json
{
  "model": "{{model}}",
  "messages": {{messages}},
  "stream": {{stream}}
}
```

`{{model}}`, `{{prompt}}` (the last user message) and `{{system}}` go inside quotes. `{{messages}}` and `{{stream}}` go without quotes. Values are escaped for you.

**Response text path** is a dot path to the text, such as `choices.0.delta.content`. Leave it empty to try the common locations.

**Streaming format** is SSE, newline-delimited JSON, or none.

## Test an OpenAI-compatible API

First check the API itself from a terminal:

```bash
curl https://api.example.com/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"your-model","messages":[{"role":"user","content":"Hi"}],"stream":true}'
```

You should see `data: {...}` lines ending in `data: [DONE]`.

Then check whether browsers are allowed:

```bash
curl -i -X OPTIONS https://api.example.com/v1/chat/completions \
  -H "Origin: https://your-nexa-domain.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

The response needs `access-control-allow-origin`. If it's missing, NEXA will report that the browser blocked the request.

Finally, use **Test connection** in NEXA. It calls the free model list when it can, and sends a tiny chat request only if it must.

## CORS

Browsers refuse a cross-origin response unless the server allows it. That is a browser rule, and no client-side code can get around it. NEXA can't know in advance which providers allow it, and behaviour can change, so it tests instead of promising.

When a request fails, NEXA sends a credential-free probe. If the server answers, the browser blocked the real request, and NEXA reports it as a CORS problem rather than a bad key. Your options:

1. **Use an endpoint that allows browsers**, such as a gateway you control. This keeps the direct connection.
2. **Enable the relay for that provider.** Your key and messages then pass through the deployment's server. Only do this on a deployment you trust.

## Local models

Your browser can reach `localhost` even from an https page, but the local server must allow the site's origin. The relay can't help, because it runs on a remote server.

**Ollama**

```bash
OLLAMA_ORIGINS="https://your-nexa-domain.com" ollama serve
```

Base URL: `http://localhost:11434/v1`. No key needed.

**LM Studio**

Start the local server, enable CORS in its settings, and use `http://localhost:1234/v1`.

Other `http://` addresses, such as a server on your network, are blocked by browsers on https pages. Serve them over https.

## Capabilities and parameters

Each model has capabilities you can correct in **Settings > Models**. They decide whether attachments are offered and which options are sent.

Only parameters you set are sent. If a model rejects one, NEXA removes it, retries, and stops sending it for that model. You can see the list in the model's settings.

## Costs

Enter input and output prices in a model's settings to see a local estimate under each response. Estimates only appear when the provider reports usage. OpenRouter prices are filled in from its model list.
