/* Copy this object into the host application's configuration layer. */
const localAIConfig = {
  baseUrl: 'http://127.0.0.1:5678/v1',
  model: 'google/gemma-4-e4b',
  apiKey: '',
  temperature: 0.4,
  maxTokens: 8192,
  timeoutMs: 90000,
  topP: null,
  seed: null,
  frequencyPenalty: null,
  presencePenalty: null
};

if (typeof module === 'object' && module.exports) module.exports = localAIConfig;
if (typeof window !== 'undefined') window.localAIConfig = localAIConfig;
