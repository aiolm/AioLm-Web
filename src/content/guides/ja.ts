import type { GuideContent } from './types';
import { DESKTOP_RELEASE_VERSION, SCREENSHOT_SOURCE_VERSION } from '@/lib/desktop-release';

const content: GuideContent = {
  title: 'AioLM ガイド',
  description: 'インストールからエンジン準備、モデル取得、最初の会話まで要点だけをまとめました。',
  navigation: 'ガイド',
  onPage: 'このページの目次',
  related: '次のステップ',
  download: 'すべてのダウンロードを見る',
  screenshotNotice: `説明は v${DESKTOP_RELEASE_VERSION} 準拠です。画像は v${SCREENSHOT_SOURCE_VERSION} macOS 版のため一部表示が異なります。`,
  enlarge: '画面を拡大',
  close: '閉じる',
  panHint: '左右に動かすと、ほかの部分も見られます。',
  guides: {
    install: {
      title: 'アプリをインストール',
      description: 'チェックサムを確認して Windows・Mac・Linux に AioLM を導入します。',
      sections: [
        {
          id: 'commands',
          title: '導入手順の概要',
          diagram: 'install-flow',
          body: ['下の OS 別セクションから簡易コマンドまたは検証済みインストーラーで導入します。'],
          points: [
            'Windows・Mac の簡易コマンドは取得したインストーラーの SHA-256 を検証しますが、スクリプト自体は事前検証なしで実行されます。',
            '先に手動検証する場合は、下の各 OS セクションからインストーラーと checksums.txt をダウンロードしてください。',
            'Linux は先に DEB パッケージをダウンロードしてからコマンドを実行します。',
          ],
        },
        {
          id: 'windows',
          title: 'Windows にインストール',
          downloads: 'windows',
          steps: [
            '同じリリースから x64-setup.exe（または MSI）と checksums.txt をダウンロードします。',
            'SHA-256 を照合してからインストーラーを実行します。',
            '完了後、スタートメニューから AioLM を開きます。',
          ],
          note: '未署名インストーラーのため警告が出る場合があります。公式リリースと SHA-256 を確認してください。',
          more: [{
            title: 'MSI とサイレント導入の補足',
            body: ['組織配布には Windows x64 MSI、個人用 PC には EXE を推奨します。install.ps1 では MSI 終了コード 3010（再起動が必要）と 1641（再起動を開始）も成功扱いです。'],
          }],
        },
        {
          id: 'macos',
          title: 'Mac にインストール',
          downloads: 'macos',
          steps: [
            'Apple メニュー → この Mac についてを確認し、Apple Silicon なら aarch64.dmg、Intel なら x64.dmg を選びます。',
            'DMG と checksums.txt を取得し、shasum -a 256 を照合してから AioLM をアプリケーションへドラッグします。',
            'ブロックされた場合は、システム設定 → プライバシーとセキュリティ → このまま開く（macOS 13–14 は Control-クリック → 開く）を選びます。',
          ],
          note: 'macOS 13.3 以降対応。Apple 未公証のため起動前に SHA-256 を確認してください。',
        },
        {
          id: 'linux',
          title: 'Linux にインストール',
          downloads: 'linux',
          body: ['Ubuntu 24.04+ x86_64 向けです。初回は DEB を推奨します。'],
          steps: [
            'DEB と checksums.txt を取得して sha256sum を確認し、DEB を開くか sudo apt install ./AioLM_*_amd64.deb を実行します。',
            'アプリメニューから AioLM を開きます。',
          ],
          more: [
            {
              title: 'DEB を押してもインストール画面が開かない場合',
              body: ['ダウンロード先に対象バージョンの DEB だけを置き、端末で上の apt コマンドを実行してください。'],
            },
            {
              title: 'AppImage で使う場合',
              body: [
                'AppImage を恒久フォルダーに置いてチェックサムを確認し、libgomp1・libfuse2t64・zenity（MCP 承認画面用）を導入します。',
                'メニュー登録は同じリリースの register-linux-desktop.py を検証後に python3 register-linux-desktop.py --appimage <ファイル> で実行します（DEB 切替前は --remove）。',
              ],
              code: 'sudo apt install libgomp1 libfuse2t64 zenity\nchmod +x ./AioLM_*.AppImage\n./AioLM_*.AppImage',
            },
          ],
        },
        {
          id: 'first-open',
          title: '初回起動',
          body: ['新規導入時は言語・テーマ・モデル保存先の設定が開き、既存設定がある場合は作業画面に直接入ります。'],
          image: 'language',
          caption: '初回起動時の言語選択画面。',
        },
        {
          id: 'verify',
          title: 'チェックサムの検証',
          body: ['実行前に同じリリースの checksums.txt と SHA-256 値を比較してください。'],
          more: [{
            title: '各 OS の SHA-256 確認コマンド',
            body: ['Windows は下の PowerShell、Mac は shasum -a 256、Linux は sha256sum を使います。不一致なら中止してください。'],
            code: `Get-FileHash -Algorithm SHA256 .\\AioLM_${DESKTOP_RELEASE_VERSION}_x64-setup.exe`,
          }],
        },
        {
          id: 'updates',
          title: '更新とトレイ常駐',
          points: [
            '起動時に GitHub リリースを一度確認して通知し、自動インストールはしません（手動確認: 設定 → 一般 → アプリの更新）。',
            'ダウンロードしてインストールは、公開 SHA-256 を検証後に処理を一時停止してインストーラーを開きます（AppImage は手動更新）。',
            'ウィンドウを閉じるとシステムトレイに隠れます。終了操作で管理プロセスを停止します。データは ~/.aiolm（Windows: %USERPROFILE%\\.aiolm）または AIOLM_HOME に残ります。',
          ],
          image: 'updates',
          caption: '設定のアプリ更新画面。',
          more: [{
            title: 'アンインストールとデータ保持',
            body: ['NSIS のみデータ削除オプションがあり、MSI・DEB・Mac のゴミ箱移動では会話と設定が残ります。Mac 更新後は Keychain アクセスを再度求められることがあります。'],
          }],
        },
      ],
    },
    'getting-started': {
      title: '最初の会話を始める',
      description: '初期設定からエンジン準備、モデル取得、チャットまで順に進めます。',
      sections: [
        {
          id: 'language',
          title: '1. 言語選択と初期設定',
          diagram: 'setup-flow',
          body: ['日本語を選んで次へを押します。設定済みの方は手順 4 へ進んでください。'],
          image: 'language',
          caption: '選択した言語に表示がすぐ切り替わります。',
        },
        {
          id: 'theme',
          title: '2. 画面テーマの選択',
          body: ['ライト・ダーク・システムから選びます。あとで設定から変更できます。'],
          image: 'theme',
          caption: 'テーマのプレビュー表示。',
        },
        {
          id: 'folder',
          title: '3. モデル保存先の選択',
          body: ['既定フォルダーまたは任意のフォルダーを選び、AioLM を始めるを押します。'],
          image: 'folder',
          caption: 'ご自身のコンピューター上のフォルダーを選んでください。',
        },
        {
          id: 'engine',
          title: '4. エンジンの準備',
          body: ['左の推論エンジン画面で OS・機器条件を確認し、ランタイムの導入または接続を行います。'],
          points: [
            '一覧には実際に導入・登録済みのバージョンが表示され、実行ファイル検査は自動で行われます（手動検査ボタンなし）。',
            '自動 vLLM・mlx-vlm 導入に対応しない環境では、別途用意した Python 環境を登録して使用してください。',
            'デスクトップのすべての help 実行には正確なプログラム・引数・ディレクトリ・環境へのネイティブ OS 承認が必要です（PR ソースビルドはユーザー権限でコンパイル）。',
          ],
          image: 'llama-install',
          caption: 'ネイティブ macOS llama.cpp Metal ランタイム画面。',
          links: [{ href: '/ja/guides/adapters#find', label: '外部エンジンの接続手順' }],
        },
        {
          id: 'download',
          title: '5. モデルの検索と取得',
          body: ['検索（Discover）は選択中のエンジンとは無関係に全形式の Hugging Face モデルを探せます。'],
          points: [
            'HF/MLX Safetensors の重みを選ぶと必要な構成・トークナイザー・分割だけを取得し、GGUF 分割モデルも一括取得します。',
            '速度・残り時間の表示、一時停止/再開（一時停止中のダウンロード）、ファイル全体のダイジェスト検証、リポジトリ単位の再試行に対応します。',
            'モデルのダウンロード中にも推論エンジンをインストールできます。',
          ],
          image: 'model-files',
          caption: 'リポジトリ説明と必要メモリーを確認して取得します。',
          more: [{
            title: '取得・リダイレクトの安全性',
            body: ['リモート Python コードの自動実行は行いません。GitHub・Hugging Face 通信は全リダイレクト（最大 10 ホップ）で HTTPS と信頼ホストを検証し、ダイジェストがないファイルは再開時に最初から取得します。'],
          }],
        },
        {
          id: 'library',
          title: '6. ライブラリでセッション管理',
          body: ['既定セッションはヘッダーとチャットから操作し、名前付きセッションとローカルファイルはライブラリ → 保存済みセッションで管理します。'],
          points: [
            'モデル名・モデル設定で設定をプレビューし、削除・コピー・更新はファイル操作行から行います。',
            '検索結果が非表示の補助ファイルだけの場合は、フィルターを保ったまま「モデル補助ファイルを表示」を押します。',
            '上流モデルの更新は未変更ファイルを再利用します（セッション停止必須、単一 GGUF 更新時は全体を再取得）。',
          ],
          image: 'model-library',
          caption: '保存済みセッションとローカルモデル一覧。',
        },
        {
          id: 'model',
          title: '7. 設定の保存と起動',
          diagram: 'memory-pools',
          body: ['「ランタイムを選択 → プロファイルを選択 → オプションを調整」の順に設定し、未選択時は利用可能な最初のランタイムを自動で選びます。'],
          points: [
            '「プロファイルを保存して起動」は設定画面を自動で閉じてバックグラウンドで検査・起動を進めます（キャンセル・失敗時の設定確認に対応）。',
            'オプション見出しは主要 CLI フラグまたは JSON キーを表示し（ホバーで完全書式）、単純項目は複数列・複雑な入力は全幅を保ちます。',
            'VRAM・実行補助 RAM・RAM オフロード・SSD オフロードを分けて確認してください。共有メモリー環境では重複合計を表示しません。',
          ],
          image: 'model-settings',
          caption: `以前の v${SCREENSHOT_SOURCE_VERSION} 設定画面例。v${DESKTOP_RELEASE_VERSION} では広いウィンドウで複数列表示されます。`,
          more: [{
            title: 'メモリー見積もり・古いオプション・タイムアウト',
            body: [
              '見積もりは対応する llama.cpp 構成（一部の Qwen ハイブリッド含む）のみ対象で、非対応構成は「推定不可」と表示します。回収可能な OS キャッシュは常駐 RAM に含めません。',
              '非 llama.cpp の古いオプション警告には「オプションを再確認」（読込失敗時は「再試行」）が付きます。起動上限は 10 分で、Windows の早期終了時は不足・破損 DLL を示します。',
            ],
          }],
        },
        {
          id: 'chat',
          title: '8. ロード済みセッションで会話',
          body: ['チャットを開き、ヘッダーのセッション選択で応答先を選んで送信します（API サーバー不要）。'],
          points: [
            'ツール承認・進捗・エラーは開始した会話だけに紐づき、別会話閲覧中は元の会話へ戻るボタンを出します。',
            '会話設定で文書検索やローカル ffmpeg による音声/動画前処理が使え、プロジェクト文書リンクはネイティブ許可を求めます。',
            'MCP サーバーの初回起動にはネイティブ OS 承認が必要で、コマンド入力時は空白を保持し破棄前に確認します。',
          ],
          image: 'chat',
          caption: 'ローカルモデルとのチャット画面。',
        },
        {
          id: 'api',
          title: 'ローカル API サーバー',
          body: ['外部連携 → API サーバーをモデルとは独立して起動できます。OpenAI（Responses ツール含む）と Anthropic Messages が 127.0.0.1:8080 を共有します。'],
          points: [
            'ループバック Host ヘッダー（以外は HTTP 421）と最大 64 同時接続を強制し、モデル未ロード時は HTTP 503 を返します。',
            'ロード済みエンジンが関数呼び出しに対応している場合、Responses・Anthropic 関数ツールを Chat Completions に変換します。',
          ],
          more: [{
            title: 'API キー寿命と macOS Dock 起動時の PATH',
            body: ['API キーはアプリ終了まで有効で、API 停止後も内部チャットは継続します。Mac の Finder/Dock 起動はシェル設定を読まないため、nvm 等の MCP ツールは絶対パスを指定してください。'],
          }],
        },
        {
          id: 'personalization',
          title: 'パーソナライズとスキル',
          body: ['設定 → パーソナライズで ~/.agents/AGENTS.md と ~/.aiolm/AGENTS.md 指示およびローカルスキルを管理します。'],
          points: [
            '競合時は AioLM 側が優先され、$skill-name による明示指定は全エンジンで動作します。',
            'モデルによる自動スキル参照（aiolm_read_skill）はツール呼び出し対応エンジンでのみ有効になります。',
          ],
          more: [{
            title: 'サイズ上限と編集保護',
            body: ['1 ファイル 64 KiB・有効スキル 128 件まで（1,024 文字超の説明は短縮）。指示・スキルは選択エンドポイントのみへ送信され設定エクスポートには含みません。'],
          }],
        },
        {
          id: 'benchmarks',
          title: 'ベンチマークと結果の共有',
          body: ['新規ベンチマークは出力長制御に対応するエンジン（ネイティブ llama.cpp、対応非 Metal vLLM）で固定出力 API テストを測定します。'],
          points: [
            'vllm-metal・MLX・自動外部接続では固定出力ベンチマークを実行できず、以前の旧上限結果や旧トークン測定とは分離されます。',
            '実行中セッションを停止して開始します。主な設定の更新承認は自動開始せず対応チェックのみ再実行します。',
            '公開結果は「ウェブサイトで管理」から編集・削除できます（コピーした復旧コードは 60 秒後に自動消去）。',
          ],
          more: [{
            title: '計測仕様とプロファイル取込',
            body: ['時間と出力バイトはクライアント観測値で、全リクエストが目標トークン数と一致する必要があります。結果からのプロファイル作成は互換のある起動設定だけを取り込みます。'],
          }],
        },
        {
          id: 'cli',
          title: 'CLI と移植用ランタイム',
          body: ['aiolm-cli はアプリ隣（Mac: AioLM.app/Contents/MacOS/aiolm-cli）に同梱されています。'],
          code: 'aiolm-cli runtime list\naiolm-cli runtime select <backend> <build>\naiolm-cli server start|status|logs|stop\naiolm-cli runtime discover [folder]\naiolm-cli runtime connect <candidate-id> <model-id> [folder]',
          more: [{
            title: 'CLI 設定・ログ・ポータブルバンドル',
            body: [
              'ヘッドレスサーバーは API キーなしでループバック接続するため信頼済み端末のみで利用してください。server logs は最新のログ末尾だけを保持します。',
              'config set は保存前に設定を検証します。管理対象 Python はビルド済みパッケージのみ使用し、runtime export/import はモデル抜きで依存関係だけをまとめます。',
            ],
          }],
        },
      ],
    },
    compatibility: {
      title: '自分の機器に合うエンジン',
      description: 'OS・アクセラレーター・モデル形式・ベンチマーク対応を表で比較します。',
      sections: [
        {
          id: 'engines',
          title: 'エンジン一覧を確認',
          body: ['左の推論エンジン一覧で「このデバイスで利用不可」と表示された項目は避けて選びます。'],
          image: 'engines',
          caption: '推論エンジン画面の対応状況と導入状態。',
        },
        {
          id: 'choose',
          title: 'エンジン互換性マトリックス',
          table: {
            headers: ['エンジン', '対応 OS・モデル形式・固定出力ベンチマーク'],
            rows: [
              ['llama.cpp', 'Windows · macOS · Linux · GGUF · 固定出力対応'],
              ['vLLM', '対応 Linux CUDA/ROCm · Safetensors · 固定出力対応（非 Metal）'],
              ['vLLM · vllm-metal', 'Apple Silicon macOS 15+ · Safetensors / 制限 GGUF · 非対応'],
              ['MLX', 'Apple Silicon macOS · MLX Safetensors · 非対応'],
              ['外部推論エンジン', 'ローカル OpenAI v1 サーバーまたはフォルダー · 応答/SSE 検証 · 非対応'],
            ],
          },
          note: 'Intel Mac は CPU の llama.cpp のみ対応し、MLX と vllm-metal は利用不可です。',
        },
        {
          id: 'models',
          title: 'モデル形式と Python 環境',
          points: [
            'llama.cpp は GGUF、vLLM・MLX は完全な config・tokenizer・processor・safetensors 一式が必要です。',
            '自動の vLLM・mlx-vlm 導入はビルド済みパッケージのみを使用するため、互換パッケージがない場合は外部 Python 環境を準備して登録してください。',
            '埋め込みモデルは埋め込みセッション、Whisper・Qwen3-ASR は音声セッションを使います（WAV 以外はローカル ffmpeg が必要）。',
          ],
          image: 'discover',
          caption: 'モデル検索は選択した実行エンジンから独立しています。',
        },
        {
          id: 'limits',
          title: '検証範囲と既知の問題',
          body: ['画像・音声・動画・ツールはモデルとエンジンの双方の対応が必要です。'],
          more: [{
            title: `v${DESKTOP_RELEASE_VERSION} の検証範囲と既知の問題`,
            body: [
              '固定出力ベンチマークは出力長制御を宣言するエンジン（ネイティブ llama.cpp、対応非 Metal vLLM）でのみ実行可能です。',
              'v0.3.2 で報告された SmolVLM 画像・動画品質問題（F09）は修正未確認です。',
              'アプリと公開 CLI は CPU 基準との数値比較機能を提供しません。',
            ],
          }],
        },
      ],
    },
    adapters: {
      title: '外部推論エンジンを接続',
      description: '自動で探す → 項目確認 → モデル選択 → 接続の 4 ステップで登録します。',
      sections: [
        {
          id: 'prepare',
          title: '接続の流れ',
          diagram: 'adapter-flow',
          body: ['設定 JSON を自作せずに、ローカル OpenAI 互換 v1 サーバーまたはインストール先を接続できます。'],
        },
        {
          id: 'find',
          title: '1. 検索と承認',
          body: ['推論エンジン → 推論エンジンを追加 → 自動で探す、またはインストール先を選択を開きます。'],
          points: [
            'フォルダー検索は起動可能なプログラムだけを検出し（DLL 等は除外）、特定のエンジン名を優先しません。',
            '稼働サーバーが 1 件だけの場合は自動確認できますが、フォルダー候補は必ず「選択項目を確認」が必要です。',
            'デスクトップの help 実行には正確なコマンド・引数・ディレクトリ・環境へのネイティブ OS 承認が必要です（取消時は承認待ちも解除）。',
          ],
          note: 'モデルセッション稼働中または他のランタイム処理中は検出・登録がロックされます。',
          image: 'auto-find',
          caption: '自動検索画面。',
        },
        {
          id: 'choose-model',
          title: '2. モデルを選択',
          body: ['実行中サーバーが返すモデル、またはフォルダー導入用のローカルモデルを選択します。'],
          points: ['サブコマンドで起動するエンジンでは、起動コマンドを選んで「選択コマンドを確認」を押します。'],
          image: 'auto-model',
          caption: '外部エンジンのモデル選択画面。',
        },
        {
          id: 'connect',
          title: '3. 接続して検証',
          body: ['接続を押すと実際のチャット応答とストリーミング検査を通過した後にアプリ内へ保存します。'],
          points: [
            '稼働中サーバーへは AioLM ローカルプロキシ経由で接続し、停止しても元のサーバー自体は終了しません。',
            '自動接続は固定出力ベンチマーク制御を宣言せず、マルチモーダル・ツール品質も保証しません。',
          ],
          image: 'auto-connect',
          caption: '接続検証完了画面。',
        },
        {
          id: 'launch-options',
          title: 'オプション設定と help 再確認',
          body: ['管理接続では、選択コマンドの実際のヘルプからグループ化されたオプション画面を生成します。'],
          points: [
            '単純項目は複数列、JSON・トークン一覧・パス・反復エディターは全幅を保ち、「コマンドとヘルプツール」を備えます。',
            'レビュー済みの help がランタイム識別情報と一致しなくなった場合（PATH など変更のない継承環境値は除外）、起動時にレビュー済み help コマンドをもう一度実行し、解析結果が同一ならレビューを引き継ぎます。help の実行は、正確なプログラムパス・引数・実際の作業ディレクトリ・環境が以前に承認されている場合のみネイティブ確認プロンプトを省略でき、これらの実行入力のいずれかが変わると改めてネイティブ承認が必要です。',
            'help が変わった場合や旧ビルドの確認のみの場合は起動を止め「オプションを再確認」が必要です。「プロファイルを保存して起動」は設定を閉じてバックグラウンドで起動・復旧します。',
          ],
          more: [{
            title: '追加の起動引数と稼働中サーバー',
            body: ['追加の起動引数はシェル解釈なしのリテラルトークンを受け付け、重複・アプリ管理フラグを拒否します。既に稼働中のサーバーの設定は AioLM から変更できません。'],
          }],
        },
        {
          id: 'unconfirmed',
          title: '接続を確認できない場合',
          body: ['プロトコル不一致や認証キー不足、起動コマンド不明確時は理由を表示して未確認のままにします。'],
          links: [{ href: '/ja/guides/adapters#files', label: '手動登録のファイル案内' }],
          more: [{
            title: 'コンテナーサーバー',
            body: ['稼働中のコンテナーがローカル OpenAI v1 を提供していれば接続できます。コンテナー自体の自動作成・管理は未対応です。'],
          }],
        },
        {
          id: 'files',
          title: '詳細：手動登録に使うファイル',
          body: ['自動検索で接続できない場合の高度な手動登録向けです。'],
          table: {
            headers: ['項目', '役割'],
            rows: [
              ['*.setup.json', '提供者が用意する入力フォーム（同伴スクリプトと一緒に保管）'],
              ['登録 manifest (*.engine.json)', '完成済み登録 JSON を取り込む場合のみ使用'],
              ['サーバー実行ファイル', 'インストーラー等ではない実際のサーバー本体'],
              ['Python インタープリター', '導入環境の python.exe または bin/python'],
              ['モデル・通常設定', '登録後に選択（.gguf, .safetensors, deployment.json 等）'],
            ],
          },
          note: '手動登録では .engine.json を自作する必要はなく、アプリ内に自動保存されます。',
        },
        {
          id: 'advanced',
          title: '詳細：手動登録の手順',
          body: ['実行ファイル・ブリッジ・プローブを手動で設定する必要がある場合のみ展開してください。'],
          more: [
            {
              title: '1. 手動登録画面とパス許可',
              body: ['モデル停止 → 推論エンジンを追加 → 詳細を開きます。ネイティブ選択で選んだ manifest はセッション許可され、手入力パスは probe・起動コマンドの確認画面が必要です。'],
              image: 'adapter-add',
              caption: '詳細登録の入口画面。',
            },
            {
              title: '2. 接続設定を読み込む (*.setup.json)',
              steps: ['AioLM接続設定を読み込む (.json) を選択します（ネイティブ選択トークンと紐づけ）。', 'パスを指定して「インストールを確認して続行」を押します。'],
              code: '展開フォルダー/\n  engine.setup.json\n  prepare.py\n  probe.py',
              body: ['同伴スクリプトは同じ展開フォルダーに保管してください。'],
            },
            {
              title: '3. 実行ファイルと引数の設定',
              body: ['実行ファイル/Python を選び、custom.<エンジン>・ランタイム ID・直接 HTTP またはブリッジを指定します。'],
              image: 'adapter-setup',
              caption: '実行方法の設定画面。',
              code: '実行ファイル: bin/python\n引数1: -m\n引数2: vendor_engine.serve',
            },
            {
              title: '4. ヘルプとプローブ設定',
              body: ['「ヘルプを探索」を実行し、モデル/ポート引数と AioLM JSON プローブ（schema_version: 1）を設定します。'],
              image: 'adapter-help',
              caption: 'ヘルプ探索ステップ。',
            },
            {
              title: '5. バインディングと互換性検査',
              body: ['probe JSON・ヘルスチェックパス・HTTP/SSE 対応を確認して登録を保存します。'],
              image: 'adapter-check',
              caption: '互換性検査の設定画面。',
            },
            {
              title: '6. 保存して実モデルをテスト',
              steps: ['「登録内容を確認 → 登録」を押します。', '新しいエンジン・ランタイムでモデルを実行し応答と停止を確認します。'],
              image: 'adapter-review',
              caption: '最終確認画面。',
              body: [],
            },
          ],
        },
        {
          id: 'trouble',
          title: 'トラブルシューティング',
          more: [
            { title: 'Python やファイルが見つからない', body: ['エンジン環境の Python を指定し、アダプターフォルダー一式を移動せず保持してください。'] },
            { title: '登録できたがモデルが動かない', body: ['モデル形式・全ファイル・メモリー・サーバーログを確認してください。'] },
            { title: '登録削除の影響', body: ['外部登録の削除は AioLM 内の記録だけを消し、エンジンやモデルファイルは残ります。'] },
          ],
        },
      ],
    },
  },
};

export default content;
