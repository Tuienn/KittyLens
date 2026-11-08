function doPost(event) {
  const reply = ok => ContentService.createTextOutput(JSON.stringify({ ok }))
    .setMimeType(ContentService.MimeType.JSON);
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty('ORDER_MAIL_SECRET') || '';
  const recipient = props.getProperty('ORDER_MAIL_TO') || 'yonggdphuong110@gmail.com';
  let message;
  try {
    message = JSON.parse(event.postData.contents);
  } catch {
    return reply(false);
  }

  if (expected.length < 32 || typeof message?.secret !== 'string' ||
      !sameSecret(message.secret, expected) ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(message.id) ||
      typeof message.subject !== 'string' || message.subject.length > 150 ||
      typeof message.text !== 'string' || message.text.length > 50000 ||
      typeof message.html !== 'string' || message.html.length > 100000) {
    return reply(false);
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return reply(false);
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get(message.id)) return reply(true);
    if (MailApp.getRemainingDailyQuota() < 1) return reply(false);

    MailApp.sendEmail({
      to: recipient, subject: message.subject, body: message.text,
      htmlBody: message.html, name: 'KittyLens'
    });
    cache.put(message.id, 'sent', 21600);
    return reply(true);
  } catch {
    return reply(false);
  } finally {
    lock.releaseLock();
  }
}

function sameSecret(actual, expected) {
  const a = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, actual);
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, expected);
  return a.reduce((diff, byte, index) => diff | (byte ^ b[index]), 0) === 0;
}
