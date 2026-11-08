import { neon } from '@neondatabase/serverless';

export function neonPreferences(connectionString, sql = neon(connectionString)) {
  let ready;
  function ensureTable() {
    // Share initialization across requests; allow a retry after a transient failure.
    ready ??= sql`
      CREATE TABLE IF NOT EXISTS accessify_preferences (
        user_id TEXT PRIMARY KEY,
        settings JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `.catch(error => { ready = undefined; throw error; });
    return ready;
  }
  return {
    async get(userId) {
      await ensureTable();
      const rows = await sql`
        SELECT settings, updated_at FROM accessify_preferences WHERE user_id = ${userId}
      `;
      return rows[0] ? { settings: rows[0].settings, updatedAt: rows[0].updated_at } : null;
    },
    async put(userId, settings) {
      await ensureTable();
      // Tagged SQL passes values separately, so user data cannot become SQL code.
      const rows = await sql`
        INSERT INTO accessify_preferences (user_id, settings, updated_at)
        VALUES (${userId}, ${JSON.stringify(settings)}::jsonb, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET settings = EXCLUDED.settings, updated_at = EXCLUDED.updated_at
        RETURNING updated_at
      `;
      return rows[0].updated_at;
    },
  };
}
