const webpush = require('web-push');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@sandhill.app';

function configureWebPush() {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.log('✅ Web Push (VAPID) 已初始化');
  } else {
    console.warn('⚠️  警告: 未設定 VAPID 金鑰，推送通知功能將無法使用');
    console.warn('   請設定環境變數: VAPID_PUBLIC_KEY 和 VAPID_PRIVATE_KEY');
    console.warn('   可以使用以下命令生成: npx web-push generate-vapid-keys');
  }

  return {
    webpush,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    VAPID_SUBJECT
  };
}

module.exports = {
  configureWebPush,
  webpush,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT
};
