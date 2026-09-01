const test = require('node:test');
const assert = require('node:assert/strict');

const ScholarAIProvider = require('../AI_App/ai_local/scholar-ai-provider.js');

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test('normalizes and persists the OpenAI provider and model', () => {
  const storage = createStorage({ ss_openai_api_key: 'sk-test_12345678901234567890' });
  const runtime = ScholarAIProvider.create({ storage, callOpenAI: async () => ({ text: 'ok' }) });

  assert.equal(ScholarAIProvider.normalizeProvider('OPENAI'), 'openai');
  assert.equal(runtime.setProvider('openai'), 'openai');
  assert.equal(runtime.setModel('gpt-5.6-terra', 'openai'), 'gpt-5.6-terra');
  assert.equal(runtime.getModel('openai'), 'gpt-5.6-terra');
  assert.equal(runtime.isOpenAIConfigured(), true);
});

test('routes ScholarAI OpenAI requests through the injected Responses API adapter', async () => {
  const storage = createStorage({
    ss_openai_api_key: 'sk-test_12345678901234567890',
    ss_scholar_ai_provider: 'openai',
    ss_scholar_ai_openai_model: 'gpt-5.6-sol'
  });
  let received = null;
  const runtime = ScholarAIProvider.create({
    storage,
    callOpenAI: async (...args) => {
      received = args;
      return { text: 'OpenAI 응답' };
    }
  });

  const result = await runtime.complete({ prompt: '질문', systemInstruction: '한국어로 답변' });

  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'gpt-5.6-sol');
  assert.equal(result.text, 'OpenAI 응답');
  assert.equal(received[0], '질문');
  assert.equal(received[1], '한국어로 답변');
  assert.equal(received[3], 'gpt-5.6-sol');
  assert.equal(received[5], 'sk-test_12345678901234567890');
});

test('reports a clear error when OpenAI is selected without an API key', async () => {
  const storage = createStorage({ ss_scholar_ai_provider: 'openai' });
  const runtime = ScholarAIProvider.create({ storage, callOpenAI: async () => ({ text: 'unused' }) });

  await assert.rejects(
    runtime.complete({ prompt: '질문' }),
    /OpenAI API Key가 없습니다/
  );
});

test('persists and routes the settings-only ScholarAI providers', async () => {
  for (const provider of ['openai-compatible', 'litertlm']) {
    const storage = createStorage();
    let received = null;
    const callback = async (...args) => {
      received = args;
      return { model: provider + '-model', text: provider + ' response' };
    };
    const runtime = ScholarAIProvider.create({
      storage,
      callOpenAICompatible: provider === 'openai-compatible' ? callback : undefined,
      callLiteRTLM: provider === 'litertlm' ? callback : undefined
    });

    assert.equal(ScholarAIProvider.normalizeProvider(provider), provider);
    assert.equal(runtime.setProvider(provider), provider);
    assert.equal(runtime.setModel(provider + '-model', provider), provider + '-model');
    assert.equal(runtime.getModel(provider), provider + '-model');

    const result = await runtime.complete({ prompt: '질문', systemInstruction: '한국어로 답변' });
    assert.equal(result.provider, provider);
    assert.equal(result.model, provider + '-model');
    assert.equal(result.text, provider + ' response');
    assert.equal(received[0], '질문');
    assert.equal(received[1], '한국어로 답변');
    assert.equal(received[3], provider + '-model');
  }
});
