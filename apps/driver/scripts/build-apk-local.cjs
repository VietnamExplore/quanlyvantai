// Build APK trên máy văn phòng (không cần EAS): ký bằng khóa EAS đã tải về credentials.json (bí mật, không đưa lên git).
//   1. npx expo prebuild -p android --clean --no-install   (sinh thư mục android/)
//   2. node scripts/build-apk-local.cjs                     (ra file D:\Android\apk\lai-xe-<phiên bản>.apk)
// Cần: D:\Android\sdk (Android SDK), D:\Android\jdk-21… (Java 21).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cred = JSON.parse(fs.readFileSync(path.join(root, 'credentials.json'), 'utf8')).android.keystore;
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const gradleFile = path.join(root, 'android', 'app', 'build.gradle');
if (!fs.existsSync(gradleFile)) throw new Error('Chưa có thư mục android/: chạy npx expo prebuild -p android --clean --no-install');

// Bản release ký bằng khóa EAS (thông tin khóa lấy từ biến môi trường lúc build)
let g = fs.readFileSync(gradleFile, 'utf8');
if (!g.includes('VNE_STORE_FILE')) {
  g = g.replace(
    /signingConfigs \{\s*\n(\s*)debug \{/,
    (m, ind) => `signingConfigs {\n${ind}release {\n${ind}    storeFile file(System.getenv('VNE_STORE_FILE'))\n${ind}    storePassword System.getenv('VNE_STORE_PASSWORD')\n${ind}    keyAlias System.getenv('VNE_KEY_ALIAS')\n${ind}    keyPassword System.getenv('VNE_KEY_PASSWORD')\n${ind}}\n${ind}debug {`,
  );
  // Chỉ đổi trong khối buildTypes (khối signingConfigs cũng có "release {")
  const bt = g.indexOf('buildTypes {');
  g = g.slice(0, bt) + g.slice(bt).replace(/(release \{[\s\S]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
  fs.writeFileSync(gradleFile, g);
}

const jdk = fs.readdirSync('D:/Android').find((d) => d.startsWith('jdk-'));
const env = {
  ...process.env,
  JAVA_HOME: `D:\\Android\\${jdk}`,
  ANDROID_HOME: 'D:\\Android\\sdk',
  ANDROID_SDK_ROOT: 'D:\\Android\\sdk',
  NODE_ENV: 'production',
  VNE_STORE_FILE: path.join(root, cred.keystorePath),
  VNE_STORE_PASSWORD: cred.keystorePassword,
  VNE_KEY_ALIAS: cred.keyAlias,
  VNE_KEY_PASSWORD: cred.keyPassword,
};
env.PATH = `${env.JAVA_HOME}\\bin;${env.PATH}`;
const r = spawnSync('.\\gradlew.bat', ['assembleRelease', '--no-daemon'], { cwd: path.join(root, 'android'), env, stdio: 'inherit', shell: true });
if (r.status !== 0) process.exit(r.status ?? 1);

const out = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
// Chữ ký phải trùng bản đang phát hành (khóa EAS) – sai thì lái xe không cài đè được
const EAS_SHA1 = 'e79b09c9f804b288858da108cf383f6d634072ed';
const bt = fs.readdirSync('D:/Android/sdk/build-tools').sort().pop();
const sig = spawnSync(`D:\\Android\\sdk\\build-tools\\${bt}\\apksigner.bat`, ['verify', '--print-certs', `"${out}"`], { env, shell: true, encoding: 'utf8' });
if (!(sig.stdout ?? '').toLowerCase().includes(EAS_SHA1)) {
  console.error('\nLỖI: APK không ký bằng khóa EAS (chữ ký khác bản đang phát hành) – không xuất file.');
  process.exit(1);
}
fs.mkdirSync('D:/Android/apk', { recursive: true });
const dest = `D:/Android/apk/lai-xe-${app.version}.apk`;
fs.copyFileSync(out, dest);
console.log(`\nXONG: ${dest} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB) · phiên bản ${app.version} (${app.android.versionCode})`);
