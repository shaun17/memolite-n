import { createHash } from "node:crypto";

const TOKEN_PATTERN = /[\w\-']+/g;
const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const NON_CJK_TOKEN = /[a-z0-9\-']+/g;
export const EMBEDDING_DIMENSIONS = 64;

export const tokenize = (text: string): string[] => {
  const lowered = text.toLowerCase();
  if (!CJK_PATTERN.test(lowered)) {
    return lowered.match(TOKEN_PATTERN) ?? [];
  }

  const tokens: string[] = [];
  let buffer = "";
  for (const character of lowered) {
    if (CJK_PATTERN.test(character)) {
      if (buffer.length > 0) {
        tokens.push(...(buffer.match(NON_CJK_TOKEN) ?? []));
        buffer = "";
      }
      tokens.push(character);
      continue;
    }
    buffer += character;
  }
  if (buffer.length > 0) {
    tokens.push(...(buffer.match(NON_CJK_TOKEN) ?? []));
  }
  return tokens;
};

export const encodeHashEmbedding = (
  text: string,
  dimensions = EMBEDDING_DIMENSIONS
): number[] => {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const digest = createHash("blake2b512").update(token, "utf8").digest();
    const bucket = digest.readUInt32BE(0) % dimensions;
    const sign = (digest[4] & 1) === 0 ? 1 : -1;
    vector[bucket] += sign;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
};

export const cosineSimilarity = (left: number[], right: number[]): number => {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

export const termOverlapScore = (query: string, content: string): number => {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) {
    return 0;
  }
  const contentTokens = new Set(tokenize(content));
  let matches = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) {
      matches += 1;
    }
  }
  return matches / queryTokens.size;
};
