'use strict';

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Notification HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return response;
}

async function sendTelegram(config, message) {
  if (!config.telegramBotToken || !config.telegramChatId) return { skipped: true, channel: 'telegram' };
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  await postJson(url, {
    chat_id: config.telegramChatId,
    text: message,
    disable_web_page_preview: true,
  });
  return { ok: true, channel: 'telegram' };
}

async function sendEmail(config, subject, message) {
  if (config.resendApiKey) {
    await postJson('https://api.resend.com/emails', {
      from: config.emailFrom || 'Kino Campus <contato@kinocampus.com.br>',
      to: [config.emailTo || 'contato@kinocampus.com.br'],
      subject,
      text: message,
    }, {
      authorization: `Bearer ${config.resendApiKey}`,
    });
    return { ok: true, channel: 'email:resend' };
  }

  if (config.emailWebhookUrl) {
    await postJson(config.emailWebhookUrl, {
      to: config.emailTo || 'contato@kinocampus.com.br',
      subject,
      text: message,
    });
    return { ok: true, channel: 'email:webhook' };
  }

  return { skipped: true, channel: 'email' };
}

async function notify(config, subject, message) {
  const results = [];
  const errors = [];
  for (const task of [
    () => sendTelegram(config, `${subject}\n\n${message}`),
    () => sendEmail(config, subject, message),
  ]) {
    try {
      results.push(await task());
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { results, errors };
}

module.exports = {
  notify,
  sendEmail,
  sendTelegram,
};
