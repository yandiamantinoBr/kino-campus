# Turnstile em 3 passos (sem programar)

Hoje o KinoCampus **já permite** copiar, portar e excluir dados **se você estiver logado**.  
O CAPTCHA (Turnstile) só é necessário para quem manda pedido de privacidade **sem conta**.

## O que fazer se você só quer usar o site (recomendado)

1. Abra https://www.kinocampus.com.br/ajuda.html?request=account_erasure  
2. Clique em **Entrar ou cadastrar**  
3. Use o e-mail da UFG  
4. Depois do login, use:
   - https://www.kinocampus.com.br/settings.html#settingsPrivacyData  
   - ou reenvie o formulário da Ajuda já logado  

**Não precisa de Cloudflare nem de chaves.**

---

## O que fazer se quiser liberar visitante sem login (opcional)

Só uma vez, na sua conta Cloudflare (grátis):

1. Abra este link:  
   https://dash.cloudflare.com/?to=/:account/turnstile  
2. Entre com e-mail (Google/GitHub também serve).  
3. **Add Widget** / Adicionar site  
4. Domínios: `kinocampus.com.br` e `www.kinocampus.com.br`  
5. Crie e copie **Site Key** e **Secret Key**  

No PC, na pasta do projeto, rode (o script pede as duas chaves e aplica sozinho):

```powershell
cd C:\Users\yan1n\Documents\GitHub\kino-campus
powershell -ExecutionPolicy Bypass -File .\scripts\ops\apply-turnstile-keys.ps1
```

Pronto: o formulário visitante ganha o CAPTCHA e o servidor valida.

---

## Por que o agente não fez o CAPTCHA sozinho

- Não há chaves Turnstile no seu PC  
- Não há token de API Cloudflare  
- O domínio usa DNS Hostinger/Vercel, não nameservers Cloudflare  
- Criar widget exige **login humano** na Cloudflare (conta grátis)  

O restante (banco, edges, formulário logado, toast, protocolo) já está no ar.
