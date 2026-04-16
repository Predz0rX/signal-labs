const axios = require('axios');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://100.70.215.94:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:14b';

/**
 * Call the LLM (Claude or Ollama) with a prompt and return parsed JSON.
 * Shared by all report modules.
 * @param {string} prompt
 * @param {object} [options]
 * @param {number} [options.maxTokens=2000]
 * @returns {object} — parsed JSON from LLM response
 */
async function callLLM(prompt, options = {}) {
  const maxTokens = options.maxTokens || 2000;

  // Try Claude first
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'PENDING') {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      });
      const text = message.content[0].text.trim();
      return parseJSON(text);
    } catch (err) {
      console.error('[llm-helper] Claude API error:', err.message);
      // Fall through to Ollama
    }
  }

  // Fallback: Ollama
  console.log(`[llm-helper] Using Ollama: ${OLLAMA_MODEL}`);
  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
      model: OLLAMA_MODEL,
      stream: false,
      options: { temperature: 0.3, num_ctx: 8192 },
      messages: [
        { role: 'system', content: 'You are a JSON-only market analyst. Return only valid JSON, no explanations, no markdown, no <think> tags.' },
        { role: 'user', content: prompt }
      ]
    }, { timeout: 120000 });

    let text = response.data?.message?.content || '';
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return parseJSON(text);
  } catch (err) {
    console.error('[llm-helper] Ollama error:', err.message);
    throw err;
  }
}

/**
 * Clean and parse JSON from LLM response.
 */
function parseJSON(text) {
  let cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];
  return JSON.parse(cleaned);
}

module.exports = { callLLM, parseJSON };
