import {
  EMBEDDING_DIMENSIONS,
  encodeHashEmbedding
} from "../../embedders/hash-embedder.js";

export type EmbedderProviderName = "hash" | "sentence_transformer";
export type RerankerProviderName = "none" | "cross_encoder";

export type EmbedderFactoryInput = {
  embedderProvider?: string | null;
  embedderModel?: string | null;
  modelBasePath?: string | null;
  modelCacheDir?: string | null;
  allowRemoteModels?: boolean;
};

export type RerankerFactoryInput = {
  rerankerProvider?: string | null;
  rerankerModel?: string | null;
  modelBasePath?: string | null;
  modelCacheDir?: string | null;
  allowRemoteModels?: boolean;
};

export type EmbedderConfig = {
  provider: EmbedderProviderName;
  modelName: string | null;
};

export type RerankerConfig = {
  provider: RerankerProviderName;
  modelName: string | null;
};

export type EmbedderProvider = {
  name: EmbedderProviderName;
  dimensions: number;
  encode: (text: string) => Promise<number[]>;
  warmUp: () => Promise<void>;
};

export type RerankableMatch = {
  episode: {
    content: string;
  };
};

export type RerankerProvider = {
  name: Exclude<RerankerProviderName, "none">;
  rerank: <TMatch extends RerankableMatch>(
    query: string,
    matches: TMatch[]
  ) => Promise<TMatch[]>;
  warmUp: () => Promise<void>;
};

export type TransformersBackendPipeline = (
  input: unknown,
  options?: Record<string, unknown>
) => Promise<unknown>;

export type TransformersBackendModule = {
  env: {
    localModelPath?: string;
    cacheDir?: string;
    allowRemoteModels?: boolean;
  };
  pipeline: (
    task: "feature-extraction" | "text-classification",
    modelName: string
  ) => Promise<TransformersBackendPipeline>;
};

type TransformersBackendLoader = () => Promise<TransformersBackendModule>;

const DEFAULT_SENTENCE_TRANSFORMER_MODEL = "BAAI/bge-small-zh-v1.5";
const DEFAULT_CROSS_ENCODER_MODEL = "BAAI/bge-reranker-base";
const DEFAULT_ALLOW_REMOTE_MODELS = true;

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);"
) as (specifier: string) => Promise<unknown>;

const loadTransformersBackend = async (): Promise<TransformersBackendModule> => {
  try {
    return (await dynamicImport("@huggingface/transformers")) as TransformersBackendModule;
  } catch (error) {
    throw new Error(
      "transformers backend is not installed; install with `npm install @huggingface/transformers`"
    );
  }
};

let transformersBackendLoader: TransformersBackendLoader = loadTransformersBackend;

export const createEmbedderConfig = (
  input: EmbedderFactoryInput
): EmbedderConfig => {
  const provider = input.embedderProvider ?? "hash";
  if (provider === "hash" || provider === "default") {
    return {
      provider: "hash",
      modelName: null
    };
  }
  if (provider === "sentence_transformer") {
    return {
      provider: "sentence_transformer",
      modelName: input.embedderModel ?? DEFAULT_SENTENCE_TRANSFORMER_MODEL
    };
  }
  throw new Error(`unsupported embedderProvider: ${provider}`);
};

export const createRerankerConfig = (
  input: RerankerFactoryInput
): RerankerConfig => {
  const provider = input.rerankerProvider ?? "none";
  if (provider === "none") {
    return {
      provider: "none",
      modelName: null
    };
  }
  if (provider === "cross_encoder") {
    return {
      provider: "cross_encoder",
      modelName: input.rerankerModel ?? DEFAULT_CROSS_ENCODER_MODEL
    };
  }
  throw new Error(`unsupported rerankerProvider: ${provider}`);
};

const configureTransformersEnvironment = (
  backend: TransformersBackendModule,
  input: {
    modelBasePath?: string | null;
    modelCacheDir?: string | null;
    allowRemoteModels?: boolean;
  }
): void => {
  if (input.modelBasePath !== undefined && input.modelBasePath !== null) {
    backend.env.localModelPath = input.modelBasePath;
  }
  if (input.modelCacheDir !== undefined && input.modelCacheDir !== null) {
    backend.env.cacheDir = input.modelCacheDir;
  }
  backend.env.allowRemoteModels = input.allowRemoteModels ?? DEFAULT_ALLOW_REMOTE_MODELS;
};

const toNumberArray = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item));
  }
  if (
    value !== null &&
    typeof value === "object" &&
    "tolist" in value &&
    typeof (value as { tolist?: () => unknown }).tolist === "function"
  ) {
    return toNumberArray((value as { tolist: () => unknown }).tolist());
  }
  if (
    value !== null &&
    typeof value === "object" &&
    "data" in value &&
    ArrayBuffer.isView((value as { data: unknown }).data)
  ) {
    return Array.from((value as { data: ArrayLike<number> }).data, (item) => Number(item));
  }
  throw new Error("unsupported embedding output from transformers backend");
};

const readClassificationScore = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }
  if (Array.isArray(value)) {
    return readClassificationScore(value[0]);
  }
  if (
    value !== null &&
    typeof value === "object" &&
    "score" in value &&
    typeof (value as { score: unknown }).score === "number"
  ) {
    return Number((value as { score: number }).score);
  }
  throw new Error("unsupported classification output from transformers backend");
};

class HashEmbedderProvider implements EmbedderProvider {
  readonly name = "hash";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async encode(text: string): Promise<number[]> {
    return encodeHashEmbedding(text);
  }

  async warmUp(): Promise<void> {}
}

class SentenceTransformerEmbedderProvider implements EmbedderProvider {
  readonly name = "sentence_transformer";
  dimensions = 0;
  private extractorPromise: Promise<TransformersBackendPipeline> | null = null;

  constructor(
    private readonly modelName: string,
    private readonly options: {
      modelBasePath?: string | null;
      modelCacheDir?: string | null;
      allowRemoteModels?: boolean;
    }
  ) {}

  async encode(text: string): Promise<number[]> {
    const extractor = await this.ensureExtractor();
    const output = await extractor(text, {
      pooling: "mean",
      normalize: true
    });
    const values = toNumberArray(output);
    this.dimensions = values.length;
    return values;
  }

  async warmUp(): Promise<void> {
    await this.ensureExtractor();
  }

  private async ensureExtractor(): Promise<TransformersBackendPipeline> {
    if (this.extractorPromise !== null) {
      return this.extractorPromise;
    }
    this.extractorPromise = (async () => {
      const backend = await transformersBackendLoader();
      configureTransformersEnvironment(backend, this.options);
      return backend.pipeline("feature-extraction", this.modelName);
    })();
    return this.extractorPromise;
  }
}

class CrossEncoderRerankerProvider implements RerankerProvider {
  readonly name = "cross_encoder";
  private classifierPromise: Promise<TransformersBackendPipeline> | null = null;

  constructor(
    private readonly modelName: string,
    private readonly options: {
      modelBasePath?: string | null;
      modelCacheDir?: string | null;
      allowRemoteModels?: boolean;
    }
  ) {}

  async rerank<TMatch extends RerankableMatch>(
    query: string,
    matches: TMatch[]
  ): Promise<TMatch[]> {
    if (matches.length === 0) {
      return matches;
    }
    const classifier = await this.ensureClassifier();
    const results = await classifier(
      matches.map((match) => ({
        text: query,
        text_pair: match.episode.content
      }))
    );
    const scores = Array.isArray(results)
      ? results.map((result) => readClassificationScore(result))
      : matches.map(() => 0);
    return matches
      .map((match, index) => ({
        match,
        score: scores[index] ?? Number.NEGATIVE_INFINITY
      }))
      .sort((left, right) => right.score - left.score)
      .map((item) => item.match);
  }

  async warmUp(): Promise<void> {
    await this.ensureClassifier();
  }

  private async ensureClassifier(): Promise<TransformersBackendPipeline> {
    if (this.classifierPromise !== null) {
      return this.classifierPromise;
    }
    this.classifierPromise = (async () => {
      const backend = await transformersBackendLoader();
      configureTransformersEnvironment(backend, this.options);
      return backend.pipeline("text-classification", this.modelName);
    })();
    return this.classifierPromise;
  }
}

export const createEmbedderProvider = (
  input: EmbedderFactoryInput
): EmbedderProvider => {
  const config = createEmbedderConfig(input);
  if (config.provider === "hash") {
    return new HashEmbedderProvider();
  }
  return new SentenceTransformerEmbedderProvider(config.modelName!, {
    modelBasePath: input.modelBasePath,
    modelCacheDir: input.modelCacheDir,
    allowRemoteModels: input.allowRemoteModels
  });
};

export const createRerankerProvider = (
  input: RerankerFactoryInput
): RerankerProvider | null => {
  const config = createRerankerConfig(input);
  if (config.provider === "none") {
    return null;
  }
  return new CrossEncoderRerankerProvider(config.modelName!, {
    modelBasePath: input.modelBasePath,
    modelCacheDir: input.modelCacheDir,
    allowRemoteModels: input.allowRemoteModels
  });
};

export const setTransformersBackendLoaderForTests = (
  loader: TransformersBackendLoader
): void => {
  transformersBackendLoader = loader;
};

export const resetTransformersBackendLoaderForTests = (): void => {
  transformersBackendLoader = loadTransformersBackend;
};
