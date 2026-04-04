import type { SqliteDatabase } from "./sqlite/database.js";

export type SessionRecord = {
  session_key: string;
  org_id: string;
  project_id: string;
  session_id: string;
  user_id: string | null;
  agent_id: string | null;
  group_id: string | null;
  summary: string;
  summary_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateSessionInput = {
  sessionKey: string;
  orgId: string;
  projectId: string;
  sessionId: string;
  userId?: string | null;
  agentId?: string | null;
  groupId?: string | null;
  summary?: string;
};

export class SessionStore {
  constructor(private readonly database: SqliteDatabase) {}

  createSession(input: CreateSessionInput): void {
    this.database.connection
      .prepare(
        `
          INSERT INTO sessions (
            session_key, org_id, project_id, session_id,
            user_id, agent_id, group_id, summary, summary_updated_at
          ) VALUES (
            @sessionKey, @orgId, @projectId, @sessionId,
            @userId, @agentId, @groupId, @summary,
            CASE WHEN @summary = '' THEN NULL ELSE CURRENT_TIMESTAMP END
          )
          ON CONFLICT(session_key)
          DO UPDATE SET
            org_id = excluded.org_id,
            project_id = excluded.project_id,
            session_id = excluded.session_id,
            user_id = excluded.user_id,
            agent_id = excluded.agent_id,
            group_id = excluded.group_id,
            summary = excluded.summary,
            summary_updated_at = excluded.summary_updated_at,
            updated_at = CURRENT_TIMESTAMP
        `
      )
      .run({
        ...input,
        summary: input.summary ?? "",
        userId: input.userId ?? null,
        agentId: input.agentId ?? null,
        groupId: input.groupId ?? null
      });
  }

  getSession(sessionKey: string): SessionRecord | null {
    const row = this.database.connection
      .prepare(
        `
          SELECT session_key, org_id, project_id, session_id,
                 user_id, agent_id, group_id, summary,
                 summary_updated_at, created_at, updated_at
          FROM sessions
          WHERE session_key = ?
        `
      )
      .get(sessionKey) as SessionRecord | undefined;
    return row ?? null;
  }

  searchSessions(filters: {
    orgId?: string;
    projectId?: string;
    userId?: string;
    agentId?: string;
    groupId?: string;
  }): SessionRecord[] {
    const clauses: string[] = [];
    const values: string[] = [];
    const mapping: Record<string, string | undefined> = {
      org_id: filters.orgId,
      project_id: filters.projectId,
      user_id: filters.userId,
      agent_id: filters.agentId,
      group_id: filters.groupId
    };
    for (const [column, value] of Object.entries(mapping)) {
      if (value !== undefined) {
        clauses.push(`${column} = ?`);
        values.push(value);
      }
    }
    let query = `
      SELECT session_key, org_id, project_id, session_id,
             user_id, agent_id, group_id, summary,
             summary_updated_at, created_at, updated_at
      FROM sessions
    `;
    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(" AND ")}`;
    }
    query += " ORDER BY created_at, session_key";
    return this.database.connection.prepare(query).all(...values) as SessionRecord[];
  }

  deleteSession(sessionKey: string): void {
    this.database.connection
      .prepare("DELETE FROM sessions WHERE session_key = ?")
      .run(sessionKey);
  }

  updateSummary(sessionKey: string, summary: string): void {
    this.database.connection
      .prepare(
        `
          UPDATE sessions
          SET summary = ?,
              summary_updated_at = CASE
                WHEN ? = '' THEN summary_updated_at
                ELSE CURRENT_TIMESTAMP
              END,
              updated_at = CURRENT_TIMESTAMP
          WHERE session_key = ?
        `
      )
      .run(summary, summary, sessionKey);
  }
}
