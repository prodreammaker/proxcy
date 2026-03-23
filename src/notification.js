import { getGatewayConfig } from './kv-service.js';

const NOTIFY_KEY = 'gateway:notify';

const DEFAULT_NOTIFY = {
  email: 'amin.chinisaz@gmail.com',
  telegramBotToken: '',
  telegramChatId: '',
  emailEnabled: true,
  telegramEnabled: false,
  lastSent: null,
  lastResult: '',
};

export async function getNotifyConfig(kvNamespace) {
  try {
    const raw = await kvNamespace.get(NOTIFY_KEY);
    if (raw) return { ...DEFAULT_NOTIFY, ...JSON.parse(raw) };
  } catch (_) {}
  return { ...DEFAULT_NOTIFY };
}

export async function putNotifyConfig(kvNamespace, config) {
  await kvNamespace.put(NOTIFY_KEY, JSON.stringify({ ...DEFAULT_NOTIFY, ...config }));
  return { written: true };
}

export function generateVlessUris(config, host) {
  const uuid = config.uuid || '00000000-0000-0000-0000-000000000000';
  const cleanIps = Array.isArray(config.cleanIps) ? config.cleanIps : [];
  const ports = Array.isArray(config.ports) ? config.ports : [443];
  const uris = [];
  for (const ip of cleanIps) {
    for (const port of ports) {
      const label = `${ip}:${port}`;
      uris.push(
        `vless://${uuid}@${ip}:${port}?encryption=none&security=tls&sni=${host}&type=ws&host=${host}&fp=chrome#${encodeURIComponent(label)}`,
      );
    }
  }
  return uris;
}

function buildReport(config, host, uris) {
  const now = new Date().toISOString();
  let t = `🛡 Edge Gateway Daily Report\n`;
  t += `📅 ${now}\n`;
  t += `🌐 Host: ${host}\n`;
  t += `🔑 UUID: ${config.uuid ? config.uuid.substring(0, 8) + '…' : 'Not set'}\n`;
  t += `📡 Proxy IP: ${config.proxyIp || 'Default'}\n\n`;
  t += `📋 Active Configs (${uris.length}):\n\n`;
  for (const uri of uris.slice(0, 10)) {
    t += `${uri}\n\n`;
  }
  if (uris.length > 10) t += `… and ${uris.length - 10} more\n`;
  t += `\n✅ All systems operational`;
  return t;
}

export async function sendEmail(to, subject, body) {
  try {
    const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'noreply@amin-chinisaz.workers.dev', name: 'Edge Gateway' },
        subject,
        content: [{ type: 'text/plain', value: body }],
      }),
    });
    return { success: res.status >= 200 && res.status < 300, status: res.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function sendTelegram(botToken, chatId, message) {
  if (!botToken || !chatId) return { success: false, error: 'Missing bot token or chat ID' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    return { success: data.ok === true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function runScheduledNotification(env, host) {
  const results = { email: null, telegram: null, timestamp: new Date().toISOString() };

  try {
    const gwConfig = await getGatewayConfig(env.KV_DATA, env.ADMIN_UUID || '');
    const notifyConfig = await getNotifyConfig(env.KV_DATA);
    const effectiveHost = host || 'small-thunder-6298.amin-chinisaz.workers.dev';
    const uris = generateVlessUris(gwConfig, effectiveHost);
    const report = buildReport(gwConfig, effectiveHost, uris);

    if (notifyConfig.emailEnabled && notifyConfig.email) {
      results.email = await sendEmail(
        notifyConfig.email,
        `Edge Gateway Report – ${new Date().toLocaleDateString()}`,
        report,
      );
    }

    if (notifyConfig.telegramEnabled && notifyConfig.telegramBotToken && notifyConfig.telegramChatId) {
      results.telegram = await sendTelegram(
        notifyConfig.telegramBotToken,
        notifyConfig.telegramChatId,
        report,
      );
    }

    await putNotifyConfig(env.KV_DATA, {
      ...notifyConfig,
      lastSent: results.timestamp,
      lastResult: JSON.stringify(results),
    });
  } catch (err) {
    results.error = err.message;
  }

  return results;
}
