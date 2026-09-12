import { fail } from '../storage.mjs';

export const textSchema = { type: 'string' };
export const objectSchema = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
// Schemas are owned by the backend. Validate every engine's output, including
// engines offering native schema constraints. Never coerce or drop fields.
export function validateOutput(value, schema, at = 'result') {
  const invalid = () => fail('JUDGE_RESPONSE', `Invalid structured response at ${at}. No result was accepted.`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    if (schema.required?.some(k => !Object.hasOwn(value, k)) || schema.additionalProperties === false && Object.keys(value).some(k => !Object.hasOwn(schema.properties, k))) invalid();
    for (const [key, child] of Object.entries(schema.properties)) if (Object.hasOwn(value, key)) validateOutput(value[key], child, `${at}.${key}`);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > (schema.maxItems ?? 100) || value.length < (schema.minItems ?? 0)) invalid();
    value.forEach((v, i) => validateOutput(v, schema.items, `${at}[${i}]`));
  } else if (schema.type === 'integer' ? !Number.isInteger(value) : typeof value !== schema.type) invalid();
  if (schema.enum && !schema.enum.includes(value) || typeof value === 'string' && (value.includes('\0') || Buffer.byteLength(value) > (schema.maxLength ?? 150000))) invalid();
  return value;
}

export function parseAnswer(text) {
  if (typeof text !== 'string') fail('ENGINE_RESPONSE', 'The engine returned an invalid answer.');
  const body = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1');
  try { return JSON.parse(body); } catch { fail('JUDGE_RESPONSE', 'The engine did not return valid structured JSON. No result was accepted.'); }
}
