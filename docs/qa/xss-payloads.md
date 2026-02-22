# QA Manual — Payloads de XSS (V8.2.0.4)

Objetivo: validar que conteúdos de usuário são exibidos como texto (escapados), sem executar scripts.

## Regras de sucesso
- Nenhum payload deve abrir pop-up, redirecionar, executar script ou alterar DOM inesperadamente.
- O payload deve aparecer visivelmente como texto (por exemplo `&lt;img ...&gt;` ou equivalente renderizado em texto).
- Console do navegador sem erros novos relacionados a render/sanitização.

## Payload mínimo obrigatório
```txt
<img src=x onerror=alert(1)>
```

## Payloads adicionais recomendados
```txt
<script>alert('xss')</script>
```

```txt
"><svg/onload=alert(1)>
```

```txt
' onmouseover='alert(1)
```

```txt
& < > " '
```

## Onde testar (copiar/colar)
1. Título de post
2. Descrição de post
3. Comentário de post
4. Reason/Details de denúncia
5. Nome de exibição (`display_name`) de perfil

## Passos simples
1. Entre no app e abra cada fluxo acima.
2. Cole o payload mínimo e publique/salve.
3. Repita com os payloads adicionais.
4. Navegue por:
   - busca
   - detalhe do post
   - comentários
   - admin/reports
   - perfil/listagens
5. Confirme que tudo aparece como texto e nunca executa.

## Verificação de console (leigo)
1. Abra DevTools (`F12` ou `Ctrl+Shift+I`).
2. Vá para aba **Console**.
3. Recarregue a página e repita os fluxos.
4. Resultado esperado: sem erros novos de JavaScript relacionados a sanitização/render.
