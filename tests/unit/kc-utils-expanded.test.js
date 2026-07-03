beforeAll(() => {
  global.window = global.window || global;
  require('../../assets/js/boot/kc-constants.js');
  require('../../assets/js/utils/kc-utils.string.js'); // deve preceder kc-utils.js (v12.2.0)
  require('../../assets/js/utils/kc-utils.format.js'); // deve preceder kc-utils.js (v12.2.1)
  require('../../assets/js/utils/kc-utils.dom.js'); // deve preceder kc-utils.js (v12.2.2)
  require('../../assets/js/utils/kc-utils.identity.js'); // deve preceder kc-utils.js (v12.2.3)
  require('../../assets/js/utils/kc-utils.taxonomy.js'); // deve preceder kc-utils.js (v12.2.4)
  require('../../assets/js/utils/kc-utils.location.js'); // deve preceder kc-utils.js (v12.2.5)
  require('../../assets/js/utils/kc-utils.presentation.js'); // deve preceder kc-utils.js (v12.2.6)
  require('../../assets/js/utils/kc-utils.js');
});

describe('KCUtils - Testes Expandidos', () => {
  let utils;

  beforeEach(() => {
    utils = window.KCUtils;
  });

  // ── escapeHtml ───────────────────────────────────────────────────────

  describe('escapeHtml', () => {
    test('escapa & para &amp;', () => {
      expect(utils.escapeHtml('A & B')).toBe('A &amp; B');
    });

    test('escapa < para &lt;', () => {
      expect(utils.escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    test('escapa > para &gt;', () => {
      expect(utils.escapeHtml('a > b')).toBe('a &gt; b');
    });

    test('escapa aspas duplas para &quot;', () => {
      expect(utils.escapeHtml('"teste"')).toBe('&quot;teste&quot;');
    });

    test('escapa aspas simples para &#39;', () => {
      expect(utils.escapeHtml("it's")).toBe('it&#39;s');
    });

    test('lida com string vazia', () => {
      expect(utils.escapeHtml('')).toBe('');
    });

    test('lida com null retornando string vazia', () => {
      expect(utils.escapeHtml(null)).toBe('');
    });

    test('escapa multiplos caracteres especiais na mesma string', () => {
      expect(utils.escapeHtml('<b>"A & B"</b>')).toBe('&lt;b&gt;&quot;A &amp; B&quot;&lt;/b&gt;');
    });
  });

  // ── renderMarkdownInline ─────────────────────────────────────────────

  describe('renderMarkdownInline', () => {
    test('converte negrito **texto** para <strong>', () => {
      const result = utils.renderMarkdownInline('isso e **importante**');
      expect(result).toContain('<strong>importante</strong>');
    });

    test('converte italico *texto* para <em>', () => {
      const result = utils.renderMarkdownInline('isso e *enfase*');
      expect(result).toContain('<em>enfase</em>');
    });

    test('converte codigo `x` para <code>', () => {
      const result = utils.renderMarkdownInline('use `npm install`');
      expect(result).toContain('<code>npm install</code>');
    });

    test('converte tachado ~~texto~~ para <s>', () => {
      const result = utils.renderMarkdownInline('~~removido~~');
      expect(result).toContain('<s>removido</s>');
    });

    test('converte links [label](url) para <a>', () => {
      const result = utils.renderMarkdownInline('veja [KinoCampus](https://kino.campus)');
      expect(result).toContain('<a href="https://kino.campus"');
      expect(result).toContain('target="_blank"');
      expect(result).toContain('KinoCampus</a>');
    });

    test('converte links mailto sem target externo', () => {
      const result = utils.renderMarkdownInline('fale com [secretaria](mailto:sec@ufg.br)');
      expect(result).toContain('<a href="mailto:sec@ufg.br">secretaria</a>');
      expect(result).not.toContain('target="_blank"');
    });

    test('escapa HTML antes de aplicar markdown', () => {
      const result = utils.renderMarkdownInline('<script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    test('retorna string vazia para input nulo', () => {
      expect(utils.renderMarkdownInline(null)).toBe('');
    });
  });

  // ── canonicalCategory ────────────────────────────────────────────────

  describe('canonicalCategory', () => {
    test('normaliza texto removendo acentos e convertendo para minusculas', () => {
      expect(utils.canonicalCategory('Eletrônicos')).toBe('eletronico');
    });

    test('remove # inicial', () => {
      expect(utils.canonicalCategory('#eventos')).toBe('evento');
    });

    test('remove plural basico (s final)', () => {
      expect(utils.canonicalCategory('livros')).toBe('livro');
    });

    test('nao remove s de palavras curtas (3 letras ou menos)', () => {
      expect(utils.canonicalCategory('gas')).toBe('gas');
    });

    test('lida com string vazia', () => {
      expect(utils.canonicalCategory('')).toBe('');
    });
  });

  // ── titleCase ────────────────────────────────────────────────────────

  describe('titleCase', () => {
    test('capitaliza primeira letra de cada palavra', () => {
      expect(utils.titleCase('kino campus')).toBe('Kino Campus');
    });

    test('lida com string vazia', () => {
      expect(utils.titleCase('')).toBe('');
    });

    test('lida com null', () => {
      expect(utils.titleCase(null)).toBe('');
    });

    test('remove espacos extras entre palavras', () => {
      expect(utils.titleCase('  kino   campus  ')).toBe('Kino Campus');
    });
  });

  // ── beautifyKey ──────────────────────────────────────────────────────

  describe('beautifyKey', () => {
    test('substitui underscores por espacos e aplica titleCase', () => {
      expect(utils.beautifyKey('compra_venda')).toBe('Compra Venda');
    });

    test('substitui hifens por espacos e aplica titleCase', () => {
      expect(utils.beautifyKey('achados-perdidos')).toBe('Achados Perdidos');
    });

    test('lida com string vazia', () => {
      expect(utils.beautifyKey('')).toBe('');
    });

    test('lida com null', () => {
      expect(utils.beautifyKey(null)).toBe('');
    });
  });

  // ── getModuleLabel ───────────────────────────────────────────────────

  describe('getModuleLabel', () => {
    test('retorna label para modulo conhecido', () => {
      expect(utils.getModuleLabel('moradia')).toBe('Moradia');
    });

    test('retorna label para modulo com acento', () => {
      expect(utils.getModuleLabel('Eventos')).toBe('Eventos');
    });

    test('fallback para beautifyKey quando modulo desconhecido', () => {
      const result = utils.getModuleLabel('modulo-novo');
      expect(result).toBeTruthy();
    });
  });

  // ── getModuleIconClass ───────────────────────────────────────────────

  describe('getModuleIconClass', () => {
    test('retorna icone para modulo conhecido', () => {
      expect(utils.getModuleIconClass('moradia')).toBe('fas fa-home');
    });

    test('retorna icone padrao para modulo desconhecido', () => {
      expect(utils.getModuleIconClass('inexistente')).toBe('fas fa-layer-group');
    });

    test('retorna icone para caronas', () => {
      expect(utils.getModuleIconClass('caronas')).toBe('fas fa-car');
    });
  });

  // ── getCategoryLabel ─────────────────────────────────────────────────

  describe('getCategoryLabel', () => {
    test('retorna label de categoria conhecida', () => {
      expect(utils.getCategoryLabel('compra-venda', 'eletronicos')).toBe('Eletrônicos');
    });

    test('retorna label de categoria moradia', () => {
      expect(utils.getCategoryLabel('moradia', 'republica')).toBe('República');
    });

    test('fallback para beautifyKey em categoria desconhecida', () => {
      const result = utils.getCategoryLabel('eventos', 'algo-novo');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ── getConditionLabel ────────────────────────────────────────────────

  describe('getConditionLabel', () => {
    test('retorna Semi-novo quando contem semi', () => {
      expect(utils.getConditionLabel('Semi-novo')).toBe('Semi-novo');
    });

    test('retorna Novo quando contem novo', () => {
      expect(utils.getConditionLabel('Novo')).toBe('Novo');
    });

    test('retorna string vazia para input vazio', () => {
      expect(utils.getConditionLabel('')).toBe('');
    });

    test('retorna beautifyKey para condicao desconhecida', () => {
      const result = utils.getConditionLabel('usado');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('semi-novo tem prioridade sobre novo', () => {
      expect(utils.getConditionLabel('semi-novo')).toBe('Semi-novo');
    });
  });

  // ── clamp ────────────────────────────────────────────────────────────

  describe('clamp', () => {
    test('retorna o valor quando esta dentro do intervalo', () => {
      expect(utils.clamp(5, 0, 10)).toBe(5);
    });

    test('retorna min quando valor e menor que min', () => {
      expect(utils.clamp(-5, 0, 10)).toBe(0);
    });

    test('retorna max quando valor e maior que max', () => {
      expect(utils.clamp(15, 0, 10)).toBe(10);
    });

    test('retorna min quando valor igual a min', () => {
      expect(utils.clamp(0, 0, 10)).toBe(0);
    });

    test('retorna max quando valor igual a max', () => {
      expect(utils.clamp(10, 0, 10)).toBe(10);
    });
  });

  // ── splitPriceText ───────────────────────────────────────────────────

  describe('splitPriceText', () => {
    test('retorna main e small vazios para input vazio', () => {
      const result = utils.splitPriceText('');
      expect(result).toEqual({ main: '', small: '' });
    });

    test('separa texto com quebra de linha', () => {
      const result = utils.splitPriceText('R$ 500\npor mes');
      expect(result.main).toBe('R$ 500');
      expect(result.small).toBe('por mes');
    });

    test('separa texto com parenteses', () => {
      const result = utils.splitPriceText('R$ 300 (negociavel)');
      expect(result.main).toBe('R$ 300');
      expect(result.small).toBe('negociavel');
    });

    test('separa texto com separador traco', () => {
      const result = utils.splitPriceText('R$ 500 - inclui contas');
      expect(result.main).toBe('R$ 500');
      expect(result.small).toBe('inclui contas');
    });

    test('retorna texto inteiro em main quando nao ha separador', () => {
      const result = utils.splitPriceText('R$ 1.200');
      expect(result.main).toBe('R$ 1.200');
      expect(result.small).toBe('');
    });

    test('separa texto com unidade /mes', () => {
      const result = utils.splitPriceText('R$ 5,00/mês Ida e volta');
      expect(result.main).toContain('/mês');
      expect(result.small).toBeTruthy();
    });
  });

  // ── buildPublicHandle ────────────────────────────────────────────────

  describe('buildPublicHandle', () => {
    test('cria handle com prefixo @ por padrao', () => {
      expect(utils.buildPublicHandle('Yan Diamantino')).toBe('@yan-diamantino');
    });

    test('remove prefixo @ quando options.prefix e false', () => {
      expect(utils.buildPublicHandle('Yan', { prefix: false })).toBe('yan');
    });

    test('retorna string vazia para input vazio', () => {
      expect(utils.buildPublicHandle('')).toBe('');
    });

    test('limita o slug a 32 caracteres', () => {
      const long = 'a'.repeat(50);
      const result = utils.buildPublicHandle(long);
      // @ + 32 chars = 33
      expect(result.length).toBeLessThanOrEqual(33);
    });
  });

  // ── getEmailDomain ───────────────────────────────────────────────────

  describe('getEmailDomain', () => {
    test('extrai dominio de email valido', () => {
      expect(utils.getEmailDomain('aluno@discente.ufg.br')).toBe('discente.ufg.br');
    });

    test('retorna string vazia para email sem @', () => {
      expect(utils.getEmailDomain('semdominio')).toBe('');
    });

    test('normaliza para minusculas', () => {
      expect(utils.getEmailDomain('User@UFG.BR')).toBe('ufg.br');
    });
  });

  // ── normalizeAllowedDomains ──────────────────────────────────────────

  describe('normalizeAllowedDomains', () => {
    test('remove duplicatas e normaliza para minusculas', () => {
      const result = utils.normalizeAllowedDomains(['UFG.BR', 'ufg.br', 'Discente.UFG.BR']);
      expect(result).toEqual(['ufg.br', 'discente.ufg.br']);
    });

    test('retorna array vazio para input nao-array', () => {
      expect(utils.normalizeAllowedDomains(null)).toEqual([]);
      expect(utils.normalizeAllowedDomains('string')).toEqual([]);
    });

    test('filtra valores falsy', () => {
      const result = utils.normalizeAllowedDomains(['ufg.br', '', null, undefined, 'usp.br']);
      expect(result).toEqual(['ufg.br', 'usp.br']);
    });
  });

  describe('copyTextToClipboard', () => {
    let originalClipboard;
    let originalExecCommand;

    beforeEach(() => {
      originalClipboard = navigator.clipboard;
      originalExecCommand = document.execCommand;
    });

    afterEach(() => {
      if (typeof originalClipboard === 'undefined') {
        delete navigator.clipboard;
      } else {
        navigator.clipboard = originalClipboard;
      }

      if (typeof originalExecCommand === 'undefined') {
        delete document.execCommand;
      } else {
        document.execCommand = originalExecCommand;
      }

      document.body.innerHTML = '';
    });

    test('usa navigator.clipboard quando disponivel', async () => {
      navigator.clipboard = {
        writeText: jest.fn().mockResolvedValue(undefined),
      };

      const copied = await utils.copyTextToClipboard('https://www.kinocampus.com.br');

      expect(copied).toBe(true);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://www.kinocampus.com.br');
    });

    test('cai para execCommand quando a Clipboard API nao existe', async () => {
      delete navigator.clipboard;
      document.execCommand = jest.fn(() => true);

      const copied = await utils.copyTextToClipboard('Link KinoCampus');

      expect(copied).toBe(true);
      expect(document.execCommand).toHaveBeenCalledWith('copy');
      expect(document.querySelector('textarea')).toBeNull();
    });

    test('reaproveita o campo alvo no fallback quando a Clipboard API falha', async () => {
      const input = document.createElement('input');
      document.body.appendChild(input);

      navigator.clipboard = {
        writeText: jest.fn().mockRejectedValue(new Error('denied')),
      };
      document.execCommand = jest.fn(() => true);

      const copied = await utils.copyTextToClipboard('Texto copiado', { target: input });

      expect(copied).toBe(true);
      expect(input.value).toBe('Texto copiado');
      expect(document.execCommand).toHaveBeenCalledWith('copy');
    });
  });

  describe('buildProductDetailHref', () => {
    test('monta a rota canônica do detalhe com o id informado', () => {
      expect(utils.buildProductDetailHref('abc-123')).toBe('_product.html?id=abc-123');
    });

    test('codifica caracteres especiais no id', () => {
      expect(utils.buildProductDetailHref('uuid/with spaces')).toBe('_product.html?id=uuid%2Fwith%20spaces');
    });

    test('retorna string vazia para id ausente', () => {
      expect(utils.buildProductDetailHref('')).toBe('');
      expect(utils.buildProductDetailHref(null)).toBe('');
    });
  });
});
