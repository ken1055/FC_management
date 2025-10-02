const session = require("express-session");
const { createClient } = require("@supabase/supabase-js");

class SupabaseSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.tableName = options.tableName || "user_sessions";
    this.client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
  }

  async get(sid, callback) {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select("data")
        .eq("sid", sid)
        .single();
      if (error || !data) return callback(null, null);
      return callback(null, JSON.parse(data.data));
    } catch (err) {
      return callback(err);
    }
  }

  async set(sid, sessionData, callback) {
    try {
      console.log("[SessionStore] set sid=", sid);
      if (!sessionData || typeof sessionData !== "object") {
        console.warn("[SessionStore] invalid session data");
      }
      const expiresAt = new Date(
        Date.now() + (sessionData.cookie?.maxAge || 7 * 24 * 60 * 60 * 1000)
      );
      const payload = {
        sid,
        data: JSON.stringify(sessionData),
        expires_at: expiresAt.toISOString(),
      };
      const { error } = await this.client.from(this.tableName).upsert(payload);
      if (error) console.error("[SessionStore] upsert error:", error);
      return callback(error || null);
    } catch (err) {
      console.error("[SessionStore] set exception:", err);
      return callback(err);
    }
  }

  async destroy(sid, callback) {
    try {
      console.log("[SessionStore] destroy sid=", sid);
      const { error } = await this.client
        .from(this.tableName)
        .delete()
        .eq("sid", sid);
      return callback(error || null);
    } catch (err) {
      return callback(err);
    }
  }
}

module.exports = SupabaseSessionStore;
