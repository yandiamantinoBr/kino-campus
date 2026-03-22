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
      postUrl: 'https://kinocampus.app/product.html?id=123',
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
});
