import type { SqliteDatabase } from "./sqlite/database.js";

export type EpisodeRecord = {
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
};

export type EpisodePayload = {
  uid: string;
  sessionKey: string;
  sessionId: string;
  producerId: string;
  producerRole: string;
  producedForId?: string | null;
  sequenceNum?: number;
  content: string;
  contentType?: string;
  episodeType?: string;
  metadataJson?: string | null;
  filterableMetadataJson?: string | null;
  deleted?: number;
};

export class EpisodeStore {
  constructor(private readonly database: SqliteDatabase) {}

  addEpisodes(payloads: EpisodePayload[]): void {
    const statement = this.database.connection.prepare(
      `
        INSERT INTO episodes (
          uid, session_key, session_id, producer_id, producer_role,
          produced_for_id, sequence_num, content, content_type, episode_type,
          metadata_json, filterable_metadata_json, deleted
        ) VALUES (
          @uid, @sessionKey, @sessionId, @producerId, @producerRole,
          @producedForId, @sequenceNum, @content, @contentType, @episodeType,
          @metadataJson, @filterableMetadataJson, @deleted
        )
        ON CONFLICT(uid) DO UPDATE SET
          session_key = excluded.session_key,
          session_id = excluded.session_id,
          producer_id = excluded.producer_id,
          producer_role = excluded.producer_role,
          produced_for_id = excluded.produced_for_id,
          sequence_num = excluded.sequence_num,
          content = excluded.content,
          content_type = excluded.content_type,
          episode_type = excluded.episode_type,
          metadata_json = excluded.metadata_json,
          filterable_metadata_json = excluded.filterable_metadata_json,
          deleted = excluded.deleted
      `
    );
    const transaction = this.database.connection.transaction((items: EpisodePayload[]) => {
      for (const payload of items) {
        statement.run({
          uid: payload.uid,
          sessionKey: payload.sessionKey,
          sessionId: payload.sessionId,
          producerId: payload.producerId,
          producerRole: payload.producerRole,
          producedForId: payload.producedForId ?? null,
          sequenceNum: payload.sequenceNum ?? 0,
          content: payload.content,
          contentType: payload.contentType ?? "string",
          episodeType: payload.episodeType ?? "message",
          metadataJson: payload.metadataJson ?? null,
          filterableMetadataJson: payload.filterableMetadataJson ?? null,
          deleted: payload.deleted ?? 0
        });
      }
    });
    transaction(payloads);
  }

  getEpisodes(uids: string[]): EpisodeRecord[] {
    if (uids.length === 0) {
      return [];
    }
    const placeholders = uids.map(() => "?").join(", ");
    return this.database.connection
      .prepare(
        `
          SELECT uid, session_key, session_id, producer_id, producer_role,
                 produced_for_id, sequence_num, content, content_type,
                 episode_type, created_at, metadata_json,
                 filterable_metadata_json, deleted
          FROM episodes
          WHERE uid IN (${placeholders})
          ORDER BY created_at, uid
        `
      )
      .all(...uids) as EpisodeRecord[];
  }

  listEpisodes(options: {
    sessionKey?: string;
    includeDeleted?: boolean;
  } = {}): EpisodeRecord[] {
    const clauses: string[] = [];
    const values: string[] = [];
    if (options.sessionKey !== undefined) {
      clauses.push("session_key = ?");
      values.push(options.sessionKey);
    }
    if (!options.includeDeleted) {
      clauses.push("deleted = 0");
    }
    let query = `
      SELECT uid, session_key, session_id, producer_id, producer_role,
             produced_for_id, sequence_num, content, content_type,
             episode_type, created_at, metadata_json,
             filterable_metadata_json, deleted
      FROM episodes
    `;
    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(" AND ")}`;
    }
    query += " ORDER BY sequence_num, created_at, uid";
    return this.database.connection.prepare(query).all(...values) as EpisodeRecord[];
  }

  deleteEpisodes(uids: string[]): void {
    if (uids.length === 0) {
      return;
    }
    const placeholders = uids.map(() => "?").join(", ");
    this.database.connection
      .prepare(`UPDATE episodes SET deleted = 1 WHERE uid IN (${placeholders}) AND deleted = 0`)
      .run(...uids);
  }

  purgeSessionEpisodes(sessionKey: string): void {
    this.database.connection
      .prepare("DELETE FROM episodes WHERE session_key = ?")
      .run(sessionKey);
  }
}
