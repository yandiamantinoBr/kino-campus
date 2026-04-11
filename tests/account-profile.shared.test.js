const AccountProfile = require('../assets/js/account-profile.shared.js');

describe('KCAccountProfileUtils', () => {
  test('normalizeWhatsappE164 e formatWhatsAppDisplay padronizam numeros brasileiros', () => {
    expect(AccountProfile.normalizeWhatsappE164('(62) 99876-5432')).toBe('+5562998765432');
    expect(AccountProfile.buildWhatsAppE164('+55', '(62) 99876-5432')).toBe('+5562998765432');
    expect(AccountProfile.formatWhatsAppDisplay('+5562998765432')).toBe('+55 (62) 99876-5432');
  });

  test('getVisibleSocialLinks respeita ordem publica e visibilidade individual', () => {
    const links = AccountProfile.getVisibleSocialLinks({
      contact_primary_method: 'instagram',
      social_links: {
        linkedin: 'linkedin.com/in/kino-campus',
        instagram: '@kino.ufg',
        whatsapp: '+5562998765432',
        tiktok: '@kinocampus'
      },
      social_visibility: {
        whatsapp: true,
        instagram: true,
        linkedin: true,
        tiktok: false
      }
    });

    expect(links.map((item) => item.key)).toEqual(['whatsapp', 'instagram', 'linkedin']);
    expect(links[1]).toMatchObject({
      key: 'instagram',
      isPrimary: true,
      href: 'https://instagram.com/kino.ufg'
    });
  });

  test('buildContactAction exige login e escolhe o canal principal configurado', () => {
    const baseParams = {
      profile: {
        contact_primary_method: 'whatsapp',
        contact_cta_enabled: true,
        social_links: {
          whatsapp: '+5562998765432',
          email_public: 'contato@exemplo.com'
        },
        social_visibility: {
          whatsapp: true,
          email_public: true
        }
      },
      postTitle: 'Mesa para estudo',
      postUrl: 'https://kinocampus.app/_product.html?id=123',
      viewProfileHref: 'profile.html?id=abc'
    };

    expect(AccountProfile.buildContactAction({
      ...baseParams,
      viewerAuthenticated: false
    })).toMatchObject({
      type: 'login_required',
      label: 'Entrar para contatar'
    });

    expect(AccountProfile.buildContactAction({
      ...baseParams,
      viewerAuthenticated: true
    })).toMatchObject({
      type: 'whatsapp',
      label: 'Falar no WhatsApp'
    });
  });

  test('buildContactAction cai para ver perfil quando o contato publico esta desativado', () => {
    const action = AccountProfile.buildContactAction({
      profile: {
        contact_primary_method: 'whatsapp',
        contact_cta_enabled: false,
        social_links: {
          whatsapp: '+5562998765432'
        },
        social_visibility: {
          whatsapp: true
        }
      },
      viewerAuthenticated: true,
      postTitle: 'Mesa para estudo',
      postUrl: 'https://kinocampus.app/_product.html?id=123',
      viewProfileHref: '/profile.html?id=abc'
    });

    expect(action).toMatchObject({
      type: 'view_profile',
      label: 'Ver perfil',
      href: '/profile.html?id=abc'
    });
  });

  test('buildOnboardingProfilePatch normaliza campos e marca onboarding como completo', () => {
    const patch = AccountProfile.buildOnboardingProfilePatch({
      display_name: '  Kino Campus  ',
      affiliation: 'undergrad_student',
      contact_primary_method: 'email_public',
      gender_identity: 'self_described',
      gender_identity_custom: 'Pessoa queer',
      social_links: {
        email_public: ' pessoa@ufg.br ',
        instagram: '@kino.ufg'
      },
      social_visibility: {
        email_public: true,
        instagram: true
      }
    });

    expect(patch).toMatchObject({
      display_name: 'Kino Campus',
      affiliation: 'undergrad_student',
      contact_primary_method: 'email_public'
    });
    expect(patch.social_links).toMatchObject({
      email_public: 'pessoa@ufg.br',
      instagram: 'https://instagram.com/kino.ufg'
    });
    expect(patch.social_visibility).toMatchObject({
      email_public: true,
      instagram: true
    });
    expect(typeof patch.onboarding_completed_at).toBe('string');
  });

  test('buildDefaultNotificationPreferences cria defaults canonicos por evento e canal', () => {
    const preferences = AccountProfile.buildDefaultNotificationPreferences();

    expect(preferences).toMatchObject({
      comment_on_post: { in_app: true, email: false, whatsapp: false },
      comment_reply: { in_app: true, email: false, whatsapp: false },
      vote_on_post: { in_app: true, email: false, whatsapp: false },
      post_expired: { in_app: true, email: false, whatsapp: false },
      post_reported: { in_app: true, email: false, whatsapp: false },
      system: { in_app: true, email: false, whatsapp: false }
    });
  });

  test('normalizeNotificationPreferences preserva overrides e recompõe faltantes', () => {
    const normalized = AccountProfile.normalizeNotificationPreferences({
      comment_on_post: { in_app: false, email: true },
      system: { whatsapp: true }
    });

    expect(normalized.comment_on_post).toEqual({
      in_app: false,
      email: true,
      whatsapp: false
    });
    expect(normalized.system).toEqual({
      in_app: true,
      email: false,
      whatsapp: true
    });
    expect(normalized.vote_on_post).toEqual({
      in_app: true,
      email: false,
      whatsapp: false
    });
  });

  test('getSuggestedAvatarUrls gera lotes estaveis e distintos', () => {
    const firstBatch = AccountProfile.getSuggestedAvatarUrls('yan', { batch: 0, size: 8 });
    const secondBatch = AccountProfile.getSuggestedAvatarUrls('yan', { batch: 1, size: 8 });

    expect(firstBatch).toHaveLength(8);
    expect(secondBatch).toHaveLength(8);
    expect(new Set(firstBatch).size).toBe(8);
    expect(firstBatch).not.toEqual(secondBatch);
  });

  test('buildEmojiAvatarDataUrl cria avatar serializado com emoji e cor', () => {
    const dataUrl = AccountProfile.buildEmojiAvatarDataUrl('\uD83C\uDF93', '#FF7C00');

    expect(dataUrl.startsWith('data:image/svg+xml;charset=UTF-8,')).toBe(true);
    const decoded = decodeURIComponent(dataUrl.replace('data:image/svg+xml;charset=UTF-8,', ''));
    expect(decoded).toContain('\uD83C\uDF93');
    expect(decoded).toContain('#FF7C00');
  });
});
