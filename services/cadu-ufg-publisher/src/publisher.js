'use strict';

const { toPostgrestInsert } = require('./mapper');

function required(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

class SupabasePublisher {
  constructor(config) {
    this.url = required('CADU_SUPABASE_URL', config.supabaseUrl).replace(/\/+$/, '');
    this.anonKey = required('CADU_SUPABASE_ANON_KEY', config.supabaseAnonKey);
    this.email = required('CADU_KINO_EMAIL', config.kinoEmail);
    this.password = required('CADU_KINO_PASSWORD', config.kinoPassword);
    this.session = null;
  }

  headers(token) {
    return {
      apikey: this.anonKey,
      authorization: `Bearer ${token || this.session.access_token}`,
      'content-type': 'application/json',
    };
  }

  async signIn() {
    const response = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: this.anonKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase Auth failed: HTTP ${response.status} ${text.slice(0, 300)}`);
    this.session = JSON.parse(text);
    if (!this.session.access_token || !this.session.user || !this.session.user.id) {
      throw new Error('Supabase Auth did not return a valid session.');
    }
    await this.ensureProfile();
    return this.session;
  }

  async ensureProfile() {
    const payload = {
      id: this.session.user.id,
      full_name: 'Cadu Bot',
      display_name: 'Cadu Bot',
      profile_public: true,
    };
    const response = await fetch(`${this.url}/rest/v1/profiles?on_conflict=id`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Profile sync failed: HTTP ${response.status} ${text.slice(0, 300)}`);
    }
  }

  async checkPostLimit(moduleName) {
    const response = await fetch(`${this.url}/rest/v1/rpc/kc_check_post_limit`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ p_user_id: this.session.user.id, p_module: moduleName || null }),
    });
    if (!response.ok) return { ok: true, skipped: true };
    const data = await response.json();
    return data || { ok: true };
  }

  async createPost(payload) {
    if (!this.session) await this.signIn();
    const row = toPostgrestInsert(payload, this.session.user.id);
    const limit = await this.checkPostLimit(row.module);
    if (limit && limit.ok === false) {
      return { ok: false, code: 'POST_LIMIT_REACHED', limit };
    }

    const response = await fetch(`${this.url}/rest/v1/posts`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    });
    const text = await response.text();
    if (!response.ok) {
      if (text.includes('flood_limit_exceeded')) {
        return { ok: false, code: 'FLOOD_LIMIT', message: 'Limite de 3 publicacoes por hora atingido.' };
      }
      throw new Error(`Post insert failed: HTTP ${response.status} ${text.slice(0, 500)}`);
    }
    const data = JSON.parse(text);
    const post = Array.isArray(data) ? data[0] : data;
    return {
      ok: true,
      post,
      pending: post && post.status === 'pending',
      pendingReason: post && post.moderation_reason ? post.moderation_reason : '',
    };
  }
}

module.exports = {
  SupabasePublisher,
};
