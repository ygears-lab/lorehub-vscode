const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** .env（無ければ空）をパースする簡易パーサ。CI等で既に環境変数が設定済みの場合はそちらを優先する。 */
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const parsed = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      parsed[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  return {
    LOREHUB_SUPABASE_URL: process.env.LOREHUB_SUPABASE_URL ?? parsed.LOREHUB_SUPABASE_URL ?? '',
    LOREHUB_SUPABASE_ANON_KEY: process.env.LOREHUB_SUPABASE_ANON_KEY ?? parsed.LOREHUB_SUPABASE_ANON_KEY ?? '',
  };
}

const env = loadEnv();

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
