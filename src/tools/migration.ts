import { getSettings } from "../common/config/runtime-settings.js";
import { createEmbedderProvider } from "../common/models/provider-factory.js";
import { buildDerivativesForEpisode, vectorItemId } from "../derivatives/pipeline.js";
import { KuzuCompatStore } from "../graph/kuzu-compat-store.js";
import { GraphMirrorStore } from "../graph/mirror-store.js";
import { createSqliteDatabase } from "../storage/sqlite/database.js";
import { initializeSqliteSchema } from "../storage/sqlite/schema.js";
import { decodeFloat32Embedding, encodeFloat32Embedding } from "../vector/blob.js";

export type MigrationRuntimeInput = {
  sqlitePath: string;
  kuzuPath: string;
};

export type RebuildVectorsInput = MigrationRuntimeInput & {
  target?: "semantic" | "derivative" | "all";
};

const listActiveFeatures = (database: ReturnType<typeof createSqliteDatabase>) =>
  database.connection.prepare(
    `
      SELECT id, set_id, category, tag, feature_name, value
      FROM semantic_features
      WHERE deleted = 0
      ORDER BY id
    `
  ).all() as Array<{
    id: number;
    set_id: string;
    category: string;
    tag: string;
    feature_name: string;
    value: string;
  }>;

const listActiveEpisodes = (database: ReturnType<typeof createSqliteDatabase>) =>
  database.connection.prepare(
    `
      SELECT uid, session_key, session_id, producer_id, producer_role,
             produced_for_id, sequence_num, content, content_type,
             episode_type, created_at, metadata_json,
             filterable_metadata_json, deleted
      FROM episodes
      WHERE deleted = 0
      ORDER BY sequence_num, created_at, uid
    `
  ).all() as Array<{
    uid: string;
    session_key: string;
    session_id: string;
    producer_id: string;
    producer_role: string;
    produced_for_id: string | null;
    sequence_num: number;
    content: string;
    content_type: string;
    episode_type: string;
    created_at: string;
    metadata_json: string | null;
    filterable_metadata_json: string | null;
    deleted: number;
  }>;

const createMigrationEmbedder = () => {
  const settings = getSettings();
  return createEmbedderProvider({
    embedderProvider: settings.embedderProvider,
    embedderModel: settings.embedderModel,
    modelBasePath: settings.modelBasePath,
    modelCacheDir: settings.modelCacheDir,
    allowRemoteModels: settings.allowRemoteModels
  });
};

export const rebuildVectorsSnapshot = async ({
  sqlitePath,
  kuzuPath,
  target = "all"
}: RebuildVectorsInput): Promise<{
  semantic_vectors_rebuilt: number;
  episodes_rebuilt: number;
}> => {
  const database = createSqliteDatabase({ sqlitePath });
  try {
    initializeSqliteSchema(database);
    const embedder = createMigrationEmbedder();
    await embedder.warmUp();
    let semanticCount = 0;
    let derivativeCount = 0;

    if (target === "semantic" || target === "all") {
      const features = listActiveFeatures(database);
      database.connection.prepare("DELETE FROM semantic_feature_vectors").run();
      const insert = database.connection.prepare(
        "INSERT INTO semantic_feature_vectors (feature_id, embedding) VALUES (?, ?)"
      );
      for (const feature of features) {
        const embedding = await embedder.encode(`${feature.feature_name} ${feature.value}`);
        insert.run(
          feature.id,
          encodeFloat32Embedding(embedding)
        );
      }
      semanticCount = features.length;
    }

    if (target === "derivative" || target === "all") {
      const episodes = listActiveEpisodes(database);
      database.connection.prepare("DELETE FROM derivative_feature_vectors").run();
      const insert = database.connection.prepare(
        `
          INSERT INTO derivative_feature_vectors (derivative_uid, item_id, episode_uid, embedding)
          VALUES (?, ?, ?, ?)
        `
      );
      for (const episode of episodes) {
        for (const derivative of buildDerivativesForEpisode(episode as never)) {
          insert.run(
            derivative.uid,
            vectorItemId(derivative.uid),
            derivative.episode_uid,
            encodeFloat32Embedding(await embedder.encode(derivative.content))
          );
        }
      }
      new GraphMirrorStore(kuzuPath).rebuildFromEpisodes(episodes);
      derivativeCount = episodes.length;
    }

    return {
      semantic_vectors_rebuilt: semanticCount,
      episodes_rebuilt: derivativeCount
    };
  } finally {
    database.close();
  }
};

export const reconcileSnapshot = ({
  sqlitePath,
  kuzuPath
}: MigrationRuntimeInput): {
  missing_embedding_feature_ids: number[];
  orphan_semantic_vector_ids: number[];
  missing_derivative_vector_ids: string[];
  orphan_derivative_vector_ids: string[];
  missing_graph_edge_episode_ids: string[];
  missing_episode_graph_nodes: string[];
  orphan_episode_graph_nodes: string[];
  orphan_derivative_nodes: string[];
} => {
  const database = createSqliteDatabase({ sqlitePath });
  try {
    initializeSqliteSchema(database);
    const featureIds = new Set(listActiveFeatures(database).map((feature) => feature.id));
    const vectorIds = new Set(
      (database.connection.prepare("SELECT feature_id FROM semantic_feature_vectors ORDER BY feature_id").all() as Array<{
        feature_id: number;
      }>).map((row) => row.feature_id)
    );
    const episodeIds = new Set(listActiveEpisodes(database).map((episode) => episode.uid));
    const derivativeVectorIds = new Set(
      (
        database.connection
          .prepare(
            "SELECT derivative_uid, episode_uid FROM derivative_feature_vectors ORDER BY derivative_uid"
          )
          .all() as Array<{ derivative_uid: string; episode_uid: string | null }>
      ).map((row) => row.derivative_uid)
    );
    const kuzuSnapshot = new KuzuCompatStore(kuzuPath).readSnapshotSync();
    const graph =
      kuzuSnapshot.episodes.length > 0 || kuzuSnapshot.derivatives.length > 0
        ? kuzuSnapshot
        : new GraphMirrorStore(kuzuPath).readSnapshot();
    const episodeGraphIds = new Set(graph.episodes.map((node) => node.uid));
    const derivativeGraphEpisodeIds = new Set(graph.derivatives.map((node) => node.episode_uid));
    const graphDerivativeUids = new Set(graph.derivatives.map((node) => node.uid));

    return {
      missing_embedding_feature_ids: [...featureIds].filter((id) => !vectorIds.has(id)).sort((a, b) => a - b),
      orphan_semantic_vector_ids: [...vectorIds].filter((id) => !featureIds.has(id)).sort((a, b) => a - b),
      missing_derivative_vector_ids: [...graphDerivativeUids].filter((id) => !derivativeVectorIds.has(id)).sort(),
      orphan_derivative_vector_ids: [...derivativeVectorIds].filter((id) => !graphDerivativeUids.has(id)).sort(),
      missing_graph_edge_episode_ids: [...derivativeGraphEpisodeIds]
        .filter((id) => !episodeGraphIds.has(id))
        .sort(),
      missing_episode_graph_nodes: [...episodeIds].filter((id) => !episodeGraphIds.has(id)).sort(),
      orphan_episode_graph_nodes: [...episodeGraphIds].filter((id) => !episodeIds.has(id)).sort(),
      orphan_derivative_nodes: [...derivativeGraphEpisodeIds].filter((id) => !episodeIds.has(id)).sort()
    };
  } finally {
    database.close();
  }
};

export const repairSnapshot = async ({
  sqlitePath,
  kuzuPath
}: MigrationRuntimeInput): Promise<{
  semantic_vectors_rebuilt: number;
  episodes_rebuilt: number;
  orphan_records_removed: number;
  soft_delete_residue_removed: number;
}> => {
  const before = reconcileSnapshot({ sqlitePath, kuzuPath });
  const database = createSqliteDatabase({ sqlitePath });
  try {
    initializeSqliteSchema(database);
    let removed = 0;

    for (const featureId of before.orphan_semantic_vector_ids) {
      removed += database.connection
        .prepare("DELETE FROM semantic_feature_vectors WHERE feature_id = ?")
        .run(featureId).changes;
    }
    for (const episodeUid of before.orphan_derivative_vector_ids) {
      removed += database.connection
        .prepare("DELETE FROM derivative_feature_vectors WHERE derivative_uid = ?")
        .run(episodeUid).changes;
    }
    removed += before.orphan_episode_graph_nodes.length;
    removed += before.orphan_derivative_nodes.length;

    const rebuilt = await rebuildVectorsSnapshot({
      sqlitePath,
      kuzuPath,
      target: "all"
    });
    return {
      ...rebuilt,
      orphan_records_removed: removed,
      soft_delete_residue_removed: 0
    };
  } finally {
    database.close();
  }
};

export const getSemanticVectorEmbedding = (sqlitePath: string, featureId: number): number[] | null => {
  const database = createSqliteDatabase({ sqlitePath });
  try {
    initializeSqliteSchema(database);
    const row = database.connection
      .prepare("SELECT embedding FROM semantic_feature_vectors WHERE feature_id = ?")
      .get(featureId) as { embedding: Uint8Array } | undefined;
    return row === undefined ? null : decodeFloat32Embedding(row.embedding);
  } finally {
    database.close();
  }
};
