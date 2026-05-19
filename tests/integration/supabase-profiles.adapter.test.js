/**
 * @file supabase-profiles.adapter.test.js
 * @description Static contract tests for supabase.profiles.adapter.js (v11.30.9)
 * Verifica estrutura IIFE, namespace _KCSA.profiles, lazy accessors, helpers e
 * todas as funções da API de perfil.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ADAPTER_PATH = path.resolve(__dirname, '../../assets/js/adapters/supabase/supabase.profiles.adapter.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(ADAPTER_PATH, 'utf8');
});

describe('supabase.profiles.adapter.js — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCSA', () => {
    expect(source).toContain('window._KCSA = window._KCSA || {}');
  });

  test('registra window._KCSA.profiles no final do IIFE', () => {
    expect(source).toContain('window._KCSA.profiles = {');
  });

  test('fecha o IIFE com })();', () => {
    expect(source).toContain('})();');
  });

  test('não usa require/import', () => {
    expect(source).not.toMatch(/require\s*\(/);
  });
});

describe('supabase.profiles.adapter.js — lazy accessors', () => {
  test('define getSupabaseClient lendo window._KCSA.getClient', () => {
    expect(source).toContain('function getSupabaseClient()');
    expect(source).toContain('window._KCSA.getClient');
  });

  test('define getCurrentUser lendo window._KCSA.getCurrentUser', () => {
    expect(source).toContain('function getCurrentUser()');
    expect(source).toContain('window._KCSA.getCurrentUser');
  });

  test('define getENV lendo window.KCAPI.ENV de forma lazy', () => {
    expect(source).toContain('function getENV()');
    expect(source).toContain('(window.KCAPI && window.KCAPI.ENV) || {}');
  });

  test('define getProfileShared lendo window.KCAccountProfileUtils de forma lazy', () => {
    expect(source).toContain('function getProfileShared()');
    expect(source).toContain('window.KCAccountProfileUtils || {}');
  });

  test('define getOwnerProfileFields chamando getProfileShared()', () => {
    expect(source).toContain('function getOwnerProfileFields()');
    expect(source).toContain('const profileShared = getProfileShared()');
    expect(source).toContain('profileShared.OWNER_PROFILE_SELECT_FIELDS');
  });

  test('getOwnerProfileFields tem fallback com campos de profiles hardcoded', () => {
    expect(source).toContain('display_name, full_name, avatar_url, avatar_path');
    expect(source).toContain('gender_identity, gender_identity_custom');
    expect(source).toContain('social_links, social_visibility');
  });

  test('não acessa ENV na raiz do IIFE (sem const { ENV } = window.KCAPI)', () => {
    expect(source).not.toMatch(/^const \{ ENV \}/m);
  });
});

describe('supabase.profiles.adapter.js — normalizeProfilePatchForAdapter', () => {
  test('define normalizeProfilePatchForAdapter', () => {
    expect(source).toContain('function normalizeProfilePatchForAdapter(');
  });

  test('delega a profileShared.normalizeProfilePatch quando disponível', () => {
    expect(source).toContain('profileShared.normalizeProfilePatch');
  });

  test('usa getProfileShared() internamente (não acesso direto)', () => {
    expect(source).toContain('const profileShared = getProfileShared()');
  });

  test('faz spread do patch como fallback quando normalizeProfilePatch não existe', () => {
    expect(source).toContain('{ ...patch }');
  });

  test('retorna {} para patch não-objeto', () => {
    expect(source).toContain('!Array.isArray(patch)');
  });
});

describe('supabase.profiles.adapter.js — uploadProfileAvatarToSupabaseStorage', () => {
  test('define uploadProfileAvatarToSupabaseStorage async', () => {
    expect(source).toContain('async function uploadProfileAvatarToSupabaseStorage(');
  });

  test('usa const ENV = getENV() (não acesso direto a ENV global)', () => {
    expect(source).toContain('const ENV = getENV()');
  });

  test('usa bucket kino-media como fallback', () => {
    expect(source).toContain("'kino-media'");
  });

  test('valida userId — retorna erro quando vazio', () => {
    expect(source).toContain("'Usuário inválido para upload do avatar.'");
  });

  test('usa maxBytes a partir de ENV.supabase.maxImageBytes com fallback de 5MB', () => {
    expect(source).toContain('ENV.supabase.maxImageBytes');
    expect(source).toContain('5 * 1024 * 1024');
  });

  test('aceita URLs https diretamente sem upload', () => {
    expect(source).toContain('/^https?:\\/\\//i.test(raw)');
    expect(source).toContain('directUrl = raw');
  });

  test('converte data URL para blob via window._KCSA.media.dataUrlToBlob', () => {
    expect(source).toContain('window._KCSA.media.dataUrlToBlob(raw)');
  });

  test('valida MIME contra lista allowedTypes (jpeg, png, webp, gif)', () => {
    expect(source).toContain("'image/jpeg'");
    expect(source).toContain("'image/png'");
    expect(source).toContain("'image/webp'");
    expect(source).toContain("'image/gif'");
    expect(source).toContain("'Use uma imagem JPG, PNG ou WEBP para o avatar.'");
  });

  test('rasteriza avatar SVG por data URL antes de cair para blob URL', () => {
    expect(source).toContain('function blobToDataUrl(');
    expect(source).toContain('await blobToDataUrl(svgBlob)');
    expect(source).toContain('img.src = src');
  });

  test('tem fallback canvas.toDataURL quando canvas.toBlob falha', () => {
    expect(source).toContain('function canvasToPngBlob(');
    expect(source).toContain("canvas.toDataURL('image/png')");
    expect(source).toContain('media.dataUrlToBlob(dataUrl)');
  });

  test('valida magic bytes via window._KCSA.media.checkImageMagicBytes', () => {
    expect(source).toContain('window._KCSA.media.checkImageMagicBytes(blob)');
    expect(source).toContain("'O arquivo não é uma imagem válida.'");
  });

  test('comprime avatar via window._KCSA.media.compressImage (400×400, q=0.85)', () => {
    expect(source).toContain('window._KCSA.media.compressImage(blob, 400, 400, 0.85)');
  });

  test('usa window._KCSA.media.extFromMime, sanitizeFilename e path profile-avatars/{userId}', () => {
    expect(source).toContain('window._KCSA.media.extFromMime(avatarMime)');
    expect(source).toContain('window._KCSA.media.sanitizeFilename(');
    expect(source).toContain('`profile-avatars/${userId}/');
  });

  test('retorna PROFILE_AVATAR_UPLOAD_FAILED quando upload falha', () => {
    expect(source).toContain('PROFILE_AVATAR_UPLOAD_FAILED');
  });

  test('retorna { ok: true, data: { url, path } } em caso de sucesso', () => {
    expect(source).toContain('ok: true, data: { url: publicUrl, path }');
  });

  test('retorna erro quando publicUrl não pode ser obtida', () => {
    expect(source).toContain("'Não foi possível obter a URL pública do avatar.'");
  });
});

describe('supabase.profiles.adapter.js — syncCurrentProfileCache', () => {
  test('define syncCurrentProfileCache', () => {
    expect(source).toContain('function syncCurrentProfileCache(');
  });

  test('tenta window.KCProfiles.commitProfile primeiro', () => {
    expect(source).toContain('window.KCProfiles');
    expect(source).toContain('window.KCProfiles.commitProfile(profile)');
  });

  test('dispara evento kc:profilechange como fallback', () => {
    expect(source).toContain("'kc:profilechange'");
    expect(source).toContain('profile: profile || null');
  });

  test('retorna profile ou null', () => {
    expect(source).toContain('return profile || null;');
  });
});

describe('supabase.profiles.adapter.js — getMyProfile', () => {
  test('define getMyProfile async', () => {
    expect(source).toContain('async function getMyProfile()');
  });

  test('usa getSupabaseClient() (lazy)', () => {
    expect(source).toContain('const client = getSupabaseClient()');
  });

  test('usa await getCurrentUser() (lazy)', () => {
    expect(source).toContain('const user = await getCurrentUser()');
  });

  test('faz SELECT na tabela profiles usando getOwnerProfileFields()', () => {
    expect(source).toContain("from('profiles')");
    expect(source).toContain('.select(getOwnerProfileFields())');
    expect(source).toContain('.maybeSingle()');
  });

  test('chama syncCurrentProfileCache após leitura bem-sucedida', () => {
    expect(source).toContain('syncCurrentProfileCache(res.data)');
  });

  test('loga [KCAPI][profile] getMyProfile em caso de erro', () => {
    expect(source).toContain('[KCAPI][profile] getMyProfile');
  });
});

describe('supabase.profiles.adapter.js — updateMyProfile', () => {
  test('define updateMyProfile async', () => {
    expect(source).toContain('async function updateMyProfile(');
  });

  test('usa getSupabaseClient() e getCurrentUser() lazy', () => {
    expect(source).toContain('const client = getSupabaseClient()');
    expect(source).toContain('const user = await getCurrentUser()');
  });

  test('chama normalizeProfilePatchForAdapter(patch) internamente', () => {
    expect(source).toContain('normalizeProfilePatchForAdapter(patch)');
  });

  test('usa getOwnerProfileFields() no SELECT após update', () => {
    expect(source).toContain('.select(getOwnerProfileFields())');
  });

  test('valida display_name vazio', () => {
    expect(source).toContain("'Informe um nome valido.'");
  });

  test('valida avatar_url — rejeita URLs não-http', () => {
    expect(source).toContain("'URL de avatar inválida.'");
    expect(source).toContain('/^https?:\\/\\//i.test(avatarUrl)');
  });

  test('rejeita patch vazio (sem keys)', () => {
    expect(source).toContain("'Nenhuma alteração informada.'");
    expect(source).toContain('Object.keys(updates).length');
  });

  test('chama syncCurrentProfileCache com data retornado', () => {
    expect(source).toContain('syncCurrentProfileCache(data)');
  });

  test('retorna { ok: true, data } em caso de sucesso', () => {
    expect(source).toContain('return { ok: true, data };');
  });

  test('loga [KCAPI][profile] updateMyProfile em caso de erro', () => {
    expect(source).toContain('[KCAPI][profile] updateMyProfile');
  });
});

describe('supabase.profiles.adapter.js — uploadProfileAvatar', () => {
  test('define uploadProfileAvatar async', () => {
    expect(source).toContain('async function uploadProfileAvatar(');
  });

  test('usa getSupabaseClient() e getCurrentUser() lazy', () => {
    expect(source).toContain('const client = getSupabaseClient()');
    expect(source).toContain('const user = await getCurrentUser()');
  });

  test('delega para uploadProfileAvatarToSupabaseStorage(client, fileOrDataUrl, { userId })', () => {
    expect(source).toContain('uploadProfileAvatarToSupabaseStorage(client, fileOrDataUrl, { userId: user.id })');
  });

  test('loga [KCAPI][profile] uploadProfileAvatar em caso de exceção', () => {
    expect(source).toContain('[KCAPI][profile] uploadProfileAvatar exceção');
  });

  test('retorna erro quando não há cliente', () => {
    expect(source).toContain("'Supabase não inicializado.'");
  });

  test('retorna erro quando não há usuário', () => {
    expect(source).toContain("'Faça login para atualizar seu avatar.'");
  });
});

describe('supabase.profiles.adapter.js — exports window._KCSA.profiles', () => {
  test('exporta getMyProfile', () => {
    expect(source).toContain('getMyProfile,');
  });

  test('exporta updateMyProfile', () => {
    expect(source).toContain('updateMyProfile,');
  });

  test('exporta uploadProfileAvatar', () => {
    expect(source).toContain('uploadProfileAvatar,');
  });
});
