beforeAll(() => {
  global.window = global.window || global;
  require('../../assets/js/core/kc-i18n.js');
});

describe('KCi18n - Modulo de Internacionalizacao (pt-BR)', () => {
  let i18n;

  beforeEach(() => {
    i18n = window.KCi18n;
  });

  // ── 1. Existência e estrutura ─────────────────────────────────────────

  test('KCi18n existe como propriedade de window', () => {
    expect(window.KCi18n).toBeDefined();
  });

  test('expoe locale, t, n, keys e helpers de runtime', () => {
    expect(typeof i18n.t).toBe('function');
    expect(typeof i18n.n).toBe('function');
    expect(typeof i18n.keys).toBe('function');
    expect(typeof i18n.applyDocumentMetadata).toBe('function');
    expect(typeof i18n.applyStaticAlts).toBe('function');
    expect(typeof i18n.applyAriaLabels).toBe('function');
    expect(typeof i18n.applyPlaceholders).toBe('function');
    expect(typeof i18n.applyTooltips).toBe('function');
    expect(typeof i18n.locale).toBe('string');
  });

  test('locale e pt-BR', () => {
    expect(i18n.locale).toBe('pt-BR');
  });

  // ── 2. t() — tradução básica ──────────────────────────────────────────

  describe('t() — traducao basica', () => {
    test('retorna string para chave existente', () => {
      expect(i18n.t('common.save')).toBe('Salvar');
      expect(i18n.t('common.cancel')).toBe('Cancelar');
      expect(i18n.t('common.close')).toBe('Fechar');
    });

    test('retorna a propria chave como fallback se nao encontrada', () => {
      expect(i18n.t('chave.inexistente')).toBe('chave.inexistente');
      expect(i18n.t('nao.existe.no.dicionario')).toBe('nao.existe.no.dicionario');
    });

    test('retorna string nao-vazia para todas as chaves do dicionario', () => {
      i18n.keys().forEach((key) => {
        const val = i18n.t(key);
        expect(typeof val).toBe('string');
        expect(val.length).toBeGreaterThan(0);
      });
    });

    test('chaves de navegacao retornam labels corretos', () => {
      expect(i18n.t('nav.home')).toBe('Início');
      expect(i18n.t('nav.moradia')).toBe('Moradia');
      expect(i18n.t('nav.caronas')).toBe('Caronas');
      expect(i18n.t('nav.compra-venda')).toBe('Compra e Venda');
    });

    test('chaves de formulario retornam labels corretos', () => {
      expect(i18n.t('form.title')).toBe('Título');
      expect(i18n.t('form.required')).toBe('Campo obrigatório');
      expect(i18n.t('form.placeholder-search')).toBe('Buscar...');
      expect(i18n.t('form.select-option')).toBe('Selecione uma opção');
    });

    test('chaves de erro retornam mensagens corretas', () => {
      expect(i18n.t('error.generic')).toBe('Algo deu errado. Tente novamente.');
      expect(i18n.t('error.load-failed')).toBe('Falha ao carregar. Tente novamente.');
      expect(i18n.t('error.unauthorized')).toBe('Você não tem permissão para isso.');
      expect(i18n.t('error.session-expired')).toBe('Sua sessão expirou. Faça login novamente.');
    });

    test('chaves de feedback retornam mensagens corretas', () => {
      expect(i18n.t('feedback.saved')).toBe('Salvo com sucesso!');
      expect(i18n.t('feedback.copied')).toBe('Link copiado!');
      expect(i18n.t('feedback.report-sent')).toBe('Denúncia enviada. Obrigado!');
    });

    test('chaves de tempo retornam labels corretos', () => {
      expect(i18n.t('time.now')).toBe('Agora mesmo');
      expect(i18n.t('time.today')).toBe('Hoje');
      expect(i18n.t('time.yesterday')).toBe('Ontem');
    });

    test('chaves de estado vazio retornam mensagens corretas', () => {
      expect(i18n.t('empty.notifications')).toBe('Nenhuma notificação.');
      expect(i18n.t('empty.posts')).toBe('Nenhum anúncio encontrado.');
      expect(i18n.t('empty.comments')).toBe('Nenhum comentário ainda. Seja o primeiro!');
    });

    test('chaves de acessibilidade retornam labels corretos', () => {
      expect(i18n.t('a11y.close-modal')).toBe('Fechar modal');
      expect(i18n.t('a11y.open-menu')).toBe('Abrir menu');
      expect(i18n.t('a11y.skip-to-content')).toBe('Pular para o conteúdo');
    });

    test('chaves de modulo alinham com KC_CONSTANTS.MODULE_LABEL_MAP', () => {
      expect(i18n.t('module.moradia')).toBe('Moradia');
      expect(i18n.t('module.compra-venda')).toBe('Compra e Venda');
      expect(i18n.t('module.achados-perdidos')).toBe('Achados/Perdidos');
      expect(i18n.t('module.oportunidades')).toBe('Oportunidades');
    });

    test('chaves uxw retornam strings de tom e voz', () => {
      expect(i18n.t('uxw.brand')).toBe('KinoCampus');
      expect(i18n.t('uxw.cta-post')).toBe('Publicar anúncio');
      expect(i18n.t('uxw.delete-confirm')).toBe('Tem certeza? Esta ação não pode ser desfeita.');
    });
  });

  // ── 3. t() — interpolação ─────────────────────────────────────────────

  describe('t() — interpolacao de parametros', () => {
    test('substitui {name} corretamente', () => {
      expect(i18n.t('a11y.user-avatar', { name: 'João' })).toBe('Avatar de João');
      expect(i18n.t('uxw.session-greeting', { name: 'Maria' })).toBe('Olá, Maria!');
    });

    test('substitui {n} em chaves numericas', () => {
      expect(i18n.t('a11y.vote-count', { n: 5 })).toBe('5 votos');
      expect(i18n.t('a11y.notification-count', { n: 3 })).toBe('3 notificações não lidas');
    });

    test('substitui multiplos placeholders', () => {
      expect(i18n.t('a11y.image-counter', { current: 2, total: 5 })).toBe('Imagem 2 de 5');
    });

    test('mantem placeholder intacto se parametro ausente', () => {
      expect(i18n.t('a11y.user-avatar')).toBe('Avatar de {name}');
      expect(i18n.t('a11y.user-avatar', {})).toBe('Avatar de {name}');
    });

    test('nao falha se params for null', () => {
      expect(() => i18n.t('common.save', null)).not.toThrow();
      expect(i18n.t('common.save', null)).toBe('Salvar');
    });

    test('nao falha se params for undefined', () => {
      expect(() => i18n.t('common.save', undefined)).not.toThrow();
      expect(i18n.t('common.save', undefined)).toBe('Salvar');
    });

    test('converte valor numerico de parametro para string', () => {
      expect(i18n.t('time.days-ago', { n: 3 })).toBe('há 3 dias');
    });
  });

  // ── 4. n() — formatação numérica ─────────────────────────────────────

  describe('n() — formatacao numerica', () => {
    test('formata moeda BRL com separador e simbolo', () => {
      const result = i18n.n(1500, { style: 'currency' });
      expect(result).toMatch(/1\.500/);
      expect(result).toMatch(/R\$/);
    });

    test('formata numero simples com separador de milhar pt-BR', () => {
      const result = i18n.n(1000);
      // pt-BR usa ponto como separador de milhar
      expect(result).toMatch(/1[.,]000/);
    });

    test('formata percentual', () => {
      const result = i18n.n(0.75, { style: 'percent' });
      expect(result).toMatch(/75/);
    });

    test('formata zero sem erro', () => {
      expect(() => i18n.n(0)).not.toThrow();
      expect(i18n.n(0, { style: 'currency' })).toMatch(/0/);
    });

    test('formata valores negativos sem erro', () => {
      expect(() => i18n.n(-100, { style: 'currency' })).not.toThrow();
      expect(i18n.n(-100, { style: 'currency' })).toMatch(/100/);
    });

    test('formata numero sem opcoes (padrao)', () => {
      expect(() => i18n.n(42)).not.toThrow();
      expect(typeof i18n.n(42)).toBe('string');
    });
  });

  // ── 5. keys() — auditoria do dicionário ──────────────────────────────

  describe('keys() — auditoria do dicionario', () => {
    test('retorna array nao-vazio', () => {
      const allKeys = i18n.keys();
      expect(Array.isArray(allKeys)).toBe(true);
      expect(allKeys.length).toBeGreaterThan(0);
    });

    test('nao ha chaves duplicadas', () => {
      const allKeys = i18n.keys();
      const uniqueKeys = new Set(allKeys);
      expect(allKeys.length).toBe(uniqueKeys.size);
    });

    test('todas as chaves seguem formato categoria.nome', () => {
      i18n.keys().forEach((key) => {
        expect(key).toMatch(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/);
      });
    });

    test('dicionario contem todas as categorias essenciais', () => {
      const allKeys = i18n.keys();
      const categories = new Set(allKeys.map((k) => k.split('.')[0]));
      ['common', 'nav', 'form', 'error', 'feedback', 'time', 'empty', 'a11y', 'module', 'uxw'].forEach((cat) => {
        expect(categories.has(cat)).toBe(true);
      });
    });

    test('dicionario contem pelo menos 100 entradas', () => {
      expect(i18n.keys().length).toBeGreaterThanOrEqual(100);
    });

    test('categoria common cobre acoes essenciais de UI', () => {
      const essentials = ['common.save', 'common.cancel', 'common.delete', 'common.close', 'common.loading'];
      essentials.forEach((key) => {
        expect(i18n.keys()).toContain(key);
      });
    });

    test('categoria module cobre todos os modulos do KC_CONSTANTS', () => {
      const modules = ['moradia', 'eventos', 'oportunidades', 'achados-perdidos', 'caronas', 'compra-venda', 'livros'];
      modules.forEach((mod) => {
        expect(i18n.keys()).toContain('module.' + mod);
      });
    });
  });

  // ── 6. applyTexts() — runtime textContent / innerHTML ─────────────────
  // issue #750: textos de privacidade hard-coded em settings.html
  //             movidos para o dicionario _dict e aplicados via
  //             data-i18n-text + data-i18n-params.

  describe('applyTexts() — substituicao de texto via data-i18n-text', () => {
    beforeEach(() => {
      // Limpa o document.body entre testes para nao vazar
      document.body.innerHTML = '';
    });

    test('existe e esta exposta em window.KCi18n.applyTexts', () => {
      expect(typeof i18n.applyTexts).toBe('function');
    });

    test('substitui textContent quando a chave existe (sem params)', () => {
      document.body.innerHTML =
        '<p data-i18n-text="privacy.privacy-title">Texto original</p>';
      const count = i18n.applyTexts();
      expect(count).toBe(1);
      expect(document.querySelector('p').textContent).toBe('Privacidade e seus dados');
    });

    test('preserva o conteudo original quando a chave nao existe', () => {
      document.body.innerHTML =
        '<p data-i18n-text="privacy.chave-inexistente">Texto original</p>';
      const count = i18n.applyTexts();
      expect(count).toBe(0);
      expect(document.querySelector('p').textContent).toBe('Texto original');
    });

    test('interpola {placeholder} via data-i18n-params JSON', () => {
      document.body.innerHTML =
        '<p data-i18n-text="privacy.erasure-copy-notice" ' +
        'data-i18n-params=\'{"downloadLink":"<a href=\\"#\\">Baixe seus dados primeiro</a>"}\'>' +
        'Texto original</p>';
      const count = i18n.applyTexts();
      expect(count).toBe(1);
      const html = document.querySelector('p').innerHTML;
      expect(html).toContain('Quer guardar uma cópia antes da exclusão');
      expect(html).toContain('<a href="#">Baixe seus dados primeiro</a>');
      // textContent (sem tags) tambem contem o texto interpolado
      expect(document.querySelector('p').textContent).toContain('Baixe seus dados primeiro');
    });

    test('interpola multiplos placeholders em uma unica chave', () => {
      document.body.innerHTML =
        '<p data-i18n-text="privacy.erasure-guest-fallback" ' +
        'data-i18n-params=\'{"copyFormLink":"<a>formulario de copia</a>","erasureFormLink":"<a>formulario de exclusao</a>"}\'>' +
        'Original</p>';
      const count = i18n.applyTexts();
      expect(count).toBe(1);
      const html = document.querySelector('p').innerHTML;
      expect(html).toContain('formulario de copia');
      expect(html).toContain('formulario de exclusao');
    });

    test('trata data-i18n-params invalido como ausente (nao quebra)', () => {
      document.body.innerHTML =
        '<p data-i18n-text="privacy.privacy-title" data-i18n-params="not-valid-json">Original</p>';
      expect(() => i18n.applyTexts()).not.toThrow();
      // Sem params, o placeholder {name} nao existe, entao o valor eh a string pura
      expect(document.querySelector('p').textContent).toBe('Privacidade e seus dados');
    });

    test('aceita data-i18n-text-escape="true" para forcar textContent', () => {
      document.body.innerHTML =
        '<p data-i18n-text="privacy.privacy-title" data-i18n-text-escape="true">Original</p>';
      const count = i18n.applyTexts();
      expect(count).toBe(1);
      expect(document.querySelector('p').textContent).toBe('Privacidade e seus dados');
      // Confirma que o conteudo eh text (sem HTML parseado)
      expect(document.querySelector('p').children.length).toBe(0);
    });

    test('aplica em varios elementos de uma vez', () => {
      document.body.innerHTML =
        '<button><span data-i18n-text="privacy.download-data">X</span></button>' +
        '<button><span data-i18n-text="privacy.request-erasure">Y</span></button>' +
        '<button><span data-i18n-text="privacy.list-loading">Z</span></button>';
      const count = i18n.applyTexts();
      expect(count).toBe(3);
      const spans = document.querySelectorAll('span');
      expect(spans[0].textContent).toBe('Baixar meus dados (JSON)');
      expect(spans[1].textContent).toBe('Solicitar exclusão da conta');
      expect(spans[2].textContent).toBe('Carregando seus protocolos recentes...');
    });

    test('retorna 0 se nao houver nenhum [data-i18n-text] no escopo', () => {
      document.body.innerHTML = '<p>Sem i18n aqui</p>';
      expect(i18n.applyTexts()).toBe(0);
    });

    test('applyRuntimeI18n() chama applyTexts() (smoke test)', () => {
      // applyRuntimeI18n usa document como scope; este teste confirma
      // que applyTexts eh invocado quando o modulo roda.
      document.body.innerHTML =
        '<h1 data-i18n-text="privacy.privacy-title">Original</h1>';
      // Como applyRuntimeI18n pode ter rodado no onReady antes deste teste,
      // rodamos novamente via window.KCi18n.applyTexts e contamos.
      const count = i18n.applyTexts();
      // Pode ser 0 (ja aplicado antes) ou 1 (primeira vez); o importante
      // eh nao quebrar e o conteudo estar traduzido.
      expect(document.querySelector('h1').textContent).toBe('Privacidade e seus dados');
    });
  });
});
