const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** 単純な KEY=VALUE 形式のファイルをパースする。存在しなければ空を返す。 */
function parseEnvFile(filename) {
  const envPath = path.join(__dirname, filename);
  const parsed = {};
  if (!fs.existsSync(envPath)) return parsed;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    parsed[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return parsed;
}

/**
 * ビルドに埋め込むSupabaseの接続先を決める。優先順位は次の通り。
 *   1. 環境変数（CI・単発のリリースビルド）
 *   2. .env.production.local（productionビルドのときだけ読む）
 *   3. .env（日常のローカル開発）
 * 2は .gitignore の `.env*.local` に含まれるため、コミットされる心配がない。
 */
function loadEnv() {
  const local = parseEnvFile('.env');
  const prod = production ? parseEnvFile('.env.production.local') : {};
  const pick = (key) => process.env[key] ?? prod[key] ?? local[key] ?? '';
  return {
    LOREHUB_SUPABASE_URL: pick('LOREHUB_SUPABASE_URL'),
    LOREHUB_SUPABASE_ANON_KEY: pick('LOREHUB_SUPABASE_ANON_KEY'),
  };
}

const LOCAL_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i;

/**
 * 接続先はビルド時に dist/extension.js へ焼き込まれるため、間違えたまま
 * パッケージすると「インストールしても誰の環境でも動かないVSIX」が黙って出来上がる。
 * productionビルドに限り、その状態をビルド失敗として検出する。
 */
function assertProductionEnv(env) {
  const missing = Object.entries(env)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(
      `productionビルドに必要な値が設定されていません: ${missing.join(', ')}\n` +
        '.env.production.local を用意するか、環境変数を指定して実行してください。',
    );
  }
  if (LOCAL_HOST_PATTERN.test(env.LOREHUB_SUPABASE_URL)) {
    throw new Error(
      `productionビルドの接続先がローカルのままです: ${env.LOREHUB_SUPABASE_URL}\n` +
        '配布物はローカルのSupabaseに接続できません。本番のProject URLを指定してください。',
    );
  }
}

const env = loadEnv();
if (production) {
  assertProductionEnv(env);
}

/** @type {import('esbuild').Plugin} */
const watchLogPlugin = {
  name: 'watch-log',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'warning',
    define: {
      'process.env.LOREHUB_SUPABASE_URL': JSON.stringify(env.LOREHUB_SUPABASE_URL),
      'process.env.LOREHUB_SUPABASE_ANON_KEY': JSON.stringify(env.LOREHUB_SUPABASE_ANON_KEY),
      __DEV__: JSON.stringify(!production),
    },
    plugins: [watchLogPlugin],
  });

  // WebView側はブラウザ相当のサンドボックスで動くため、'vscode'をimportできないことをビルド時に検出できるよう
  // platform: 'browser' にし、externalには何も指定しない。
  const webviewCtx = await esbuild.context({
    entryPoints: ['src/webview/main.ts'],
    bundle: true,
    format: 'iife',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    outfile: 'dist/webview/main.js',
    logLevel: 'warning',
    plugins: [watchLogPlugin],
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
  } else {
    await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
