import type { SqliteDatabase } from "./sqlite/database.js";

export type ProjectRecord = {
  org_id: string;
  project_id: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export class ProjectStore {
  constructor(private readonly database: SqliteDatabase) {}

  createProject(orgId: string, projectId: string, description: string | null = null): void {
    this.database.connection
      .prepare(
        `
          INSERT INTO projects (org_id, project_id, description)
          VALUES (@orgId, @projectId, @description)
          ON CONFLICT(org_id, project_id)
          DO UPDATE SET
            description = excluded.description,
            updated_at = CURRENT_TIMESTAMP
        `
      )
      .run({
        orgId,
        projectId,
        description
      });
  }

  getProject(orgId: string, projectId: string): ProjectRecord | null {
    const row = this.database.connection
      .prepare(
        `
          SELECT org_id, project_id, description, created_at, updated_at
          FROM projects
          WHERE org_id = ? AND project_id = ?
        `
      )
      .get(orgId, projectId) as ProjectRecord | undefined;
    return row ?? null;
  }

  listProjects(orgId?: string): ProjectRecord[] {
    if (orgId !== undefined) {
      return this.database.connection
        .prepare(
          `
            SELECT org_id, project_id, description, created_at, updated_at
            FROM projects
            WHERE org_id = ?
            ORDER BY org_id, project_id
          `
        )
        .all(orgId) as ProjectRecord[];
    }

    return this.database.connection
      .prepare(
        `
          SELECT org_id, project_id, description, created_at, updated_at
          FROM projects
          ORDER BY org_id, project_id
        `
      )
      .all() as ProjectRecord[];
  }

  getEpisodeCount(orgId: string, projectId: string): number {
    const row = this.database.connection
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM episodes e
          JOIN sessions s ON s.session_key = e.session_key
          WHERE s.org_id = ? AND s.project_id = ?
            AND e.deleted = 0
        `
      )
      .get(orgId, projectId) as { count: number };
    return Number(row.count);
  }

  deleteProject(orgId: string, projectId: string): void {
    this.database.connection
      .prepare("DELETE FROM projects WHERE org_id = ? AND project_id = ?")
      .run(orgId, projectId);
  }
}
