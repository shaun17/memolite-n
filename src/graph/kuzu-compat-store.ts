import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { Connection, Database, type QueryResult } from "kuzu";

import { buildDerivativesForEpisode } from "../derivatives/pipeline.js";
import type { EpisodeRecord } from "../storage/episode-store.js";
import type {
  GraphDerivativeNode,
  GraphEpisodeNode,
  GraphMirrorSnapshot
} from "./mirror-store.js";

const KUZU_BOOTSTRAP_STATEMENTS = [
  `
    CREATE NODE TABLE IF NOT EXISTS Episode(
      uid STRING,
      session_id STRING,
      content STRING,
      content_type STRING,
      created_at STRING,
      metadata_json STRING,
      PRIMARY KEY(uid)
    )
  `,
  `
    CREATE NODE TABLE IF NOT EXISTS Derivative(
      uid STRING,
      episode_uid STRING,
      session_id STRING,
      content STRING,
      content_type STRING,
      sequence_num INT64,
      metadata_json STRING,
      PRIMARY KEY(uid)
    )
  `,
  `
    CREATE REL TABLE IF NOT EXISTS DERIVED_FROM(
      FROM Derivative TO Episode,
      relation_type STRING
    )
  `
] as const;

const emptySnapshot = (): GraphMirrorSnapshot => ({
  episodes: [],
  derivatives: []
});

export class KuzuCompatStore {
  constructor(private readonly kuzuPath: string) {}

  get databasePath(): string {
    return this.kuzuPath;
  }

  async clear(): Promise<void> {
    await this.withConnection(async (connection) => {
      await connection.query("MATCH (n:Derivative) DETACH DELETE n");
      await connection.query("MATCH (n:Episode) DETACH DELETE n");
    });
  }

  async rebuildFromEpisodes(episodes: EpisodeRecord[]): Promise<void> {
    await this.withConnection(async (connection) => {
      await connection.query("MATCH (n:Derivative) DETACH DELETE n");
      await connection.query("MATCH (n:Episode) DETACH DELETE n");

      const episodeStatement = await connection.prepare(`
        MERGE (n:Episode {uid: $uid})
        SET
          n.session_id = $session_id,
          n.content = $content,
          n.content_type = $content_type,
          n.created_at = $created_at,
          n.metadata_json = $metadata_json
      `);
      const derivativeStatement = await connection.prepare(`
        MERGE (n:Derivative {uid: $uid})
        SET
          n.episode_uid = $episode_uid,
          n.session_id = $session_id,
          n.content = $content,
          n.content_type = $content_type,
          n.sequence_num = $sequence_num,
          n.metadata_json = $metadata_json
      `);
      const edgeStatement = await connection.prepare(`
        MATCH (src:Derivative {uid: $from_uid}), (dst:Episode {uid: $to_uid})
        MERGE (src)-[r:DERIVED_FROM]->(dst)
        SET r.relation_type = $relation_type
      `);

      for (const episode of episodes) {
        await connection.execute(episodeStatement, {
          uid: episode.uid,
          session_id: episode.session_id,
          content: episode.content,
          content_type: episode.content_type,
          created_at: episode.created_at,
          metadata_json: episode.metadata_json ?? ""
        });
        for (const derivative of buildDerivativesForEpisode(episode)) {
          await connection.execute(derivativeStatement, {
            uid: derivative.uid,
            episode_uid: derivative.episode_uid,
            session_id: derivative.session_id,
            content: derivative.content,
            content_type: derivative.content_type,
            sequence_num: derivative.sequence_num,
            metadata_json: derivative.metadata_json
          });
          await connection.execute(edgeStatement, {
            from_uid: derivative.uid,
            to_uid: episode.uid,
            relation_type: "derived_from_episode"
          });
        }
      }
    });
  }

  async readSnapshot(): Promise<GraphMirrorSnapshot> {
    return this.withConnection(async (connection) => {
      const episodesResult = await connection.query(
        `
          MATCH (n:Episode)
          RETURN n.uid AS uid,
                 n.session_id AS session_id,
                 n.content AS content,
                 n.content_type AS content_type,
                 n.created_at AS created_at,
                 n.metadata_json AS metadata_json
          ORDER BY uid
        `
      );
      const derivativesResult = await connection.query(
        `
          MATCH (n:Derivative)
          RETURN n.uid AS uid,
                 n.episode_uid AS episode_uid,
                 n.session_id AS session_id,
                 n.content AS content,
                 n.content_type AS content_type,
                 n.sequence_num AS sequence_num,
                 n.metadata_json AS metadata_json
          ORDER BY uid
        `
      );
      const episodes = (await asSingleResult(episodesResult).getAll()) as GraphEpisodeNode[];
      const derivatives = (await asSingleResult(
        derivativesResult
      ).getAll()) as GraphDerivativeNode[];
      return { episodes, derivatives };
    }).catch(() => emptySnapshot());
  }

  readSnapshotSync(): GraphMirrorSnapshot {
    try {
      mkdirSync(dirname(this.databasePath), { recursive: true });
      const database = new Database(this.databasePath);
      database.initSync();
      const connection = new Connection(database);
      connection.initSync();
      try {
        for (const statement of KUZU_BOOTSTRAP_STATEMENTS) {
          connection.querySync(statement);
        }
        const episodesResult = connection.querySync(
          `
            MATCH (n:Episode)
            RETURN n.uid AS uid,
                   n.session_id AS session_id,
                   n.content AS content,
                   n.content_type AS content_type,
                   n.created_at AS created_at,
                   n.metadata_json AS metadata_json
            ORDER BY uid
          `
        );
        const derivativesResult = connection.querySync(
          `
            MATCH (n:Derivative)
            RETURN n.uid AS uid,
                   n.episode_uid AS episode_uid,
                   n.session_id AS session_id,
                   n.content AS content,
                   n.content_type AS content_type,
                   n.sequence_num AS sequence_num,
                   n.metadata_json AS metadata_json
            ORDER BY uid
          `
        );
        return {
          episodes: asSingleResultSync(episodesResult).getAllSync() as GraphEpisodeNode[],
          derivatives: asSingleResultSync(
            derivativesResult
          ).getAllSync() as GraphDerivativeNode[]
        };
      } finally {
        connection.closeSync();
        database.closeSync();
      }
    } catch {
      return emptySnapshot();
    }
  }

  private async withConnection<T>(
    work: (connection: Connection) => Promise<T>
  ): Promise<T> {
    mkdirSync(dirname(this.databasePath), { recursive: true });
    const database = new Database(this.databasePath);
    await database.init();
    const connection = new Connection(database);
    await connection.init();
    try {
      for (const statement of KUZU_BOOTSTRAP_STATEMENTS) {
        await connection.query(statement);
      }
      return await work(connection);
    } finally {
      await connection.close();
      await database.close();
    }
  }
}

const asSingleResult = (result: QueryResult | QueryResult[]): QueryResult => {
  return Array.isArray(result) ? result[0]! : result;
};

const asSingleResultSync = (result: QueryResult | QueryResult[]): QueryResult => {
  return Array.isArray(result) ? result[0]! : result;
};
