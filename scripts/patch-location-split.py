# -*- coding: utf-8 -*-
"""
v12.2.5 — substitui os 32 corpos de função do domínio location
em kc-utils.js por thin delegation wrappers para _KCU.location.
Usa brace-counting robusto (pula lista de parâmetros, ignora strings).
"""
import re

path = r'C:\Users\yan1n\Documents\GitHub\kino-campus\assets\js\kc-utils.js'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()


def find_function_span(text, func_name):
    """
    Localiza `function func_name(...){}` por contagem de chaves,
    pulando corretamente a lista de parâmetros (evita `= {}` defaults)
    e ignorando chaves dentro de strings.
    Retorna (start, end) ou (None, None).
    """
    pattern = re.compile(r'(?m)^  function ' + re.escape(func_name) + r'\b')
    m = pattern.search(text)
    if not m:
        return None, None

    func_start = m.start()

    # 1) Pular a lista de parâmetros (do primeiro ( até o ) balanceado)
    paren_open = text.find('(', func_start)
    if paren_open == -1:
        return None, None
    depth = 0
    i = paren_open
    while i < len(text):
        c = text[i]
        if c in ('"', "'"):            # pula string simples dentro dos params
            q = c; i += 1
            while i < len(text):
                if text[i] == '\\': i += 2; continue
                if text[i] == q: break
                i += 1
        elif c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                break
        i += 1
    paren_close = i  # posição do ) de fechamento

    # 2) Achar o { que abre o corpo da função (logo após o ))
    brace_start = text.find('{', paren_close)
    if brace_start == -1:
        return None, None

    # 3) Contar chaves, ignorando strings e template literals
    depth = 0
    i = brace_start
    while i < len(text):
        c = text[i]
        if c in ('"', "'", '`'):      # pula string / template literal
            q = c; i += 1
            while i < len(text):
                if text[i] == '\\': i += 2; continue
                if text[i] == q: break
                i += 1
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return func_start, i + 1
        i += 1
    return None, None


def replace_fn(text, func_name, new_body, remove_preceding_comment=False):
    """Substitui a função func_name pelo new_body. Retorna (new_text, ok)."""
    start, end = find_function_span(text, func_name)
    if start is None:
        return text, False

    region_start = start
    if remove_preceding_comment:
        # Remove bloco /* ... */ imediatamente antes da função
        before = text[:start]
        comment_end = before.rfind('*/')
        if comment_end != -1:
            comment_start = before.rfind('/*', 0, comment_end)
            if comment_start != -1:
                # Inclui o \n antes do /*
                nl = before.rfind('\n', 0, comment_start)
                region_start = nl + 1 if nl != -1 else comment_start

    return text[:region_start] + new_body + text[end:], True


not_found = []

# ── 0. Remover bloco KC_CONSTANTS restante ────────────────────────────────────
old_consts = (
    "  // Constantes de taxonomia movidas para kc-utils.taxonomy.js (v12.2.4)\n"
    "  const {\n"
    "    HOUSING_REGION_DEFINITIONS,\n"
    "    HOUSING_FEATURE_DEFINITIONS,\n"
    "    LOST_FOUND_LOCATION_DEFINITIONS\n"
    "  } = (window.KC_CONSTANTS || {});"
)
new_consts = "  // Constantes de localização movidas para kc-utils.location.js (v12.2.5)"
if old_consts in src:
    src = src.replace(old_consts, new_consts)
else:
    not_found.append('KC_CONSTANTS block')

# ── Helpers ───────────────────────────────────────────────────────────────────
def loc(func_name, sig, fallback):
    return (
        f"  // Delegacao -> window._KCU.location.{func_name} (kc-utils.location.js)\n"
        f"  function {func_name}({sig}) {{\n"
        f"    return (window._KCU && window._KCU.location) ? window._KCU.location.{func_name}({sig}) : {fallback};\n"
        f"  }}"
    )

def loc2(func_name, sig, fallback):
    return (
        f"  // Delegacao -> window._KCU.location.{func_name} (kc-utils.location.js)\n"
        f"  function {func_name}({sig}) {{\n"
        f"    return (window._KCU && window._KCU.location)\n"
        f"      ? window._KCU.location.{func_name}({sig})\n"
        f"      : {fallback};\n"
        f"  }}"
    )

# ── 1–32. Substituições ───────────────────────────────────────────────────────
steps = [
    # (func_name, sig, wrapper_fn, fallback, remove_comment)
    ('getHousingRegionDefinitions',        '',                          loc,  '[]',          False),
    ('getHousingFeatureDefinitions',       '',                          loc,  '[]',          False),
    ('getHousingFeatureEmoji',             'key',                       loc,  "'\U0001f3f7\ufe0f'", False),
    ('getLostFoundLocationEmoji',          'key',                       loc,  "'\U0001f4cd'",False),
    ('toStringArray',                      'value',                     loc,  '[]',          False),
    ('scoreHousingLabel',                  'value',                     loc,  '0',           False),
    ('pickPreferredHousingLabel',          'current, candidate',        loc,  "String(current || candidate || '')", False),
    ('formatHousingLabel',                 'value',                     loc,  "String(value || '')", False),
    ('buildDefinitionAliasMap',            'definitions',               loc,  'new Map()',   False),
    ('getHousingFuzzyThreshold',           'source, target',            loc,  '3',           False),
    ('getHousingSimilarityScore',          'source, target',            loc,  '0',           False),
    ('isCloseHousingAlias',               'candidate, alias',           loc,  'false',       False),
    ('findBestFuzzyHousingEntry',          'candidate, collection',     loc,  'null',        False),
    ('buildHousingTextParts',              'source, fallbackTags',      loc2,
     "{ explicitRegions: [], explicitFeatures: [], text: [], tags: [] }",    False),
    ('getHousingRegionInfoByKey',          'key',                       loc,  'null',        False),
    ('getHousingFeatureInfoByKey',         'key',                       loc,  'null',        False),
    ('getLostFoundLocationDefinitions',    '',                          loc,  '[]',          False),
    ('getLostFoundLocationInfoByKey',      'key',                       loc,  'null',        False),
    ('extractHousingRegionHistoryEntries', 'history',                   loc,  '[]',          False),
    ('buildHousingRegionHistoryMaps',      'history, officialAliasMap', loc2,
     "{ catalog: new Map(), aliasMap: new Map() }",                         False),
    ('resolveHousingRegion',               'source, options',           loc2,
     "{ key: '', label: '', icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isKnown: false, source: 'empty' }", False),
    ('resolveCaronasLocation',             'rawInput',                  loc2,
     "{ key: '', label: '', icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isCampus: false, isKnown: false, source: 'empty' }", True),
    ('extractHousingFeatureHistoryEntries','history',                   loc,  '[]',          False),
    ('buildHousingFeatureHistoryMaps',     'history, officialAliasMap', loc2,
     "{ catalog: new Map(), aliasMap: new Map() }",                         False),
    ('resolveSingleHousingFeature',        'value, options',            loc,  'null',        False),
    ('resolveHousingFeatures',             'source, options',           loc,  '[]',          False),
    ('resolveHousingTypeKey',              'source',                    loc,  "''",          False),
    ('buildLostFoundTextParts',            'source, fallbackTags',      loc2,
     "{ explicit: [], text: [], tags: [] }",                                False),
    ('extractLostFoundLocationHistoryEntries', 'history',               loc,  '[]',          False),
    ('buildLostFoundHistoryMaps',          'history, officialAliasMap', loc2,
     "{ catalog: new Map(), aliasMap: new Map() }",                         False),
    ('resolveLostFoundLocation',           'source, options',           loc2,
     "{ key: '', label: '', icon: 'fas fa-map-marker-alt', emoji: '\U0001f4cd', isKnown: false, source: 'empty' }", False),
    ('resolveHousingTypeFromCandidates',   'values',                    loc,  "''",          False),
]

for func_name, sig, wrapper_fn, fallback, rm_comment in steps:
    new_body = wrapper_fn(func_name, sig, fallback)
    src, ok = replace_fn(src, func_name, new_body, remove_preceding_comment=rm_comment)
    if not ok:
        not_found.append(func_name)

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

location_count = src.count('window._KCU.location')
lines = src.count('\n') + 1
print(f'Delegations to _KCU.location: {location_count}')
print(f'kc-utils.js now has {lines} lines')
print(f'Not found ({len(not_found)}):')
for nf in not_found:
    print(f'  - {nf}')
