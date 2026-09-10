LoreHub
---
*[English](README.md)*

### 溢れかえるAI用mdファイルを集中管理

新しいマシンでも、GitHubでサインインすればいつものライブラリがそのまま開きます。集め直す必要はありません。

> **Early release** — LoreHub は公開したばかりです。機能や挙動は今後変わる可能性があります。

![LoreHubのmdライブラリ画面](https://raw.githubusercontent.com/ygears-lab/lorehub-vscode/main/assets/screenshots/01-library-overview.png)

### 主な機能
- md新規作成
- 既存のファイルをインポート
- ラベル作成
- mdへのラベルを付け
- プロジェクトへのロード（ダウンロード）
  - 同名の既存ファイルが存在する場合は上書き前にdiff表示
- クラウド保存で複数環境から管理

![frontendラベルmd一覧が絞り込まれた画面](https://raw.githubusercontent.com/ygears-lab/lorehub-vscode/main/assets/screenshots/02-label-filter.png)


### 動作要件
VS Code `1.104.0` 以降

### 基本的な使い方
1. 拡張機能をインストール
2. コマンドパレット（Ctrl/Cmd + Shift + P）から **LoreHub: マイライブラリを開く** を実行
3. GitHubでログイン
4. mdを作成（もしくはインポート）
5. 必要に応じてラベルを付与
6. プロジェクトにmdをロード

*同名のファイルがある場合は、上書きの前に差分を確認できます。*
![同名ファイルをロードしたときの差分エディタ](https://raw.githubusercontent.com/ygears-lab/lorehub-vscode/main/assets/screenshots/03-load-diff.png)

### キーボード操作

| ショートカット | 動作 |
| --- | --- |
| <kbd>Ctrl/Cmd</kbd> + <kbd>S</kbd> | 編集中のmdを保存 |
| <kbd>/</kbd> | 検索へフォーカス |
| <kbd>↑</kbd> <kbd>↓</kbd> | 一覧を移動 |
| <kbd>Esc</kbd> | ポップオーバーを閉じる → 検索クリア |

### コマンド一覧

コマンドパレット（Ctrl/Cmd + Shift + P）で `lorehub` と入力すると一覧が表示されます。

| コマンド（パレット表示） | コマンドID | 説明 |
| --- | --- | --- |
| LoreHub:<br> マイライブラリを開く<br>Open My Library | `lorehub.openMdPanel` | mdの一覧・編集・ラベル付けを行う管理画面を開きます |
| LoreHub:<br>md をプロジェクトにロード<br>Load md into Project | `lorehub.loadToProject` | ライブラリのmdを選んでプロジェクトに書き出します |
| LoreHub:<br>GitHub でログイン<br>Login with GitHub | `lorehub.login` | GitHubアカウントでログインします |
| LoreHub:<br>ログアウト<br>Logout | `lorehub.logout` | ログアウトします |

※ **GitHub でログイン** は未ログインのとき、**ログアウト** はログイン中のときのみだけコマンドパレットに表示されます。


#### コマンドパレット以外からも実行できます。

- **エディタータイトルバーのボタン**: `CLAUDE.md` / `AGENTS.md` / `SKILL.md` / `.cursorrules` を開いたタブでの右上の本のアイコンから **マイライブラリを開く** を実行できます。
- **エクスプローラーの右クリックメニュー**: フォルダを右クリックすると **md をプロジェクトにロード** が表示され、そのフォルダにmdをロードできます。



### 設定

設定 → 拡張機能 → **LoreHub** から変更できます。`settings.json` に直接書いても構いません。

| 設定キー | 型 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `lorehub.statusBar.enabled` | `boolean` | `false` | ステータスバーに LoreHub へのログイン状態が表示されます |

### プライバシー

LoreHub が扱うデータについては [プライバシーポリシー](PRIVACY.ja.md) をご確認ください。
