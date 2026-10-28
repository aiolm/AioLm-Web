import type { GuideContent } from './types';
const content: GuideContent = {
  title: 'AioLM ガイド', description: '初めての方はインストールから。画面とボタンを順に確認しながら、自分のコンピューターで AI と会話しましょう。',
  navigation: 'ガイド', onPage: '項目へ移動', related: '次のステップ', download: 'すべてのダウンロードを見る',
  screenshotNotice: 'v0.3.2 の実際の画面構成にサンプルデータを入れた表示例です。名前・パス・インストール状態は説明用で、実際のインストールやモデル実行の検証記録ではありません。',
  enlarge: '画面を拡大', close: '閉じる',
  panHint: '左右に動かすと、ほかの部分も見られます。',
  guides: {
    install: { title: 'アプリをインストール', description: 'Windows・Mac・Linux のうち、お使いのコンピューターの説明だけを進めてください。', sections: [
      { id: 'windows', title: 'Windows にインストール', downloads: 'windows', steps: ['下の x64-setup.exe をダウンロードします。個人用 PC では通常このファイルを選びます。', 'ダウンロードしたファイルをダブルクリックし、インストーラーの案内に従います。', '完了したらスタートメニューから AioLM を開きます。'], note: '発行元の署名がないため、Windows が警告を表示する場合があります。AioLM の公式配布ファイルか確認してから続けてください。', more: [{ title: 'MSI はいつ使いますか？', body: ['組織の配布ツールや Windows Installer が必要な場合に使います。個人のインストールは上の EXE を選んでください。パッケージは Windows x64 向けです。'] }] },
      { id: 'macos', title: 'Mac にインストール', downloads: 'macos', steps: ['Apple メニュー → この Mac についてを開きます。チップが Apple M1・M2 などなら aarch64.dmg、プロセッサが Intel なら x64.dmg を選びます。', 'DMG を開き、AioLM をアプリケーションフォルダーへドラッグします。', 'AioLM を開きます。ブロックされたら一度起動を試し、システム設定 → プライバシーとセキュリティ → このまま開くを選びます。'], note: 'macOS 13.3 以降が必要です。アプリは ad-hoc 署名で、Apple の公証は受けていません。macOS 13–14 では Control クリック → 開くも使えます。' },
      { id: 'linux', title: 'Linux にインストール', downloads: 'linux', body: ['Ubuntu 24.04 以降の x86_64 PC 向けです。初めてなら DEB を選びます。'], steps: ['DEB をダブルクリックしてパッケージのインストール画面を開きます。関連付けがない場合は下のコマンドを使います。', '完了したらアプリメニューから AioLM を開きます。'], more: [{ title: 'DEB を押してもインストール画面が開きません', body: ['ダウンロード先で端末を開きます。フォルダーにはインストールしたいバージョンの DEB だけを置いて実行します。'], code: 'sudo apt install ./AioLM_*_amd64.deb' }, { title: 'AppImage で使う場合', body: ['AppImage を保管するフォルダーに置き、下のコマンドで起動します。移動した場合はランチャーも再登録してください。', 'アプリメニューに追加する場合、同じリリースの register-linux-desktop.py を取得・検証して python3 register-linux-desktop.py --appimage <ファイル> を実行します。DEB に切り替える前に --remove で解除してください。Python 3 が必要です。'], code: 'sudo apt install libgomp1 libfuse2t64\nchmod +x ./AioLM_*.AppImage\n./AioLM_*.AppImage' }] },
      { id: 'first-open', title: 'アプリが開いたら', body: ['下の言語画面が出れば準備完了です。日本語を選び「次へ」を押します。以前の設定がある場合は作業画面が直接開きます。'], image: 'language', caption: '初回は English で始まります。言語を選んだら「最初の会話を始める」へ進んでください。' },
      { id: 'verify', title: '取得したファイルを確認', body: ['公式のダウンロードを使ってください。ファイルが壊れていないか確認する方法は下にあります。'], more: [{ title: 'チェックサムで確認する', body: ['インストーラーと同じリリースの checksums.txt を取得します。チェックサムはファイルを識別する値です。コマンドの結果全体を、同じファイル名の SHA-256 と比較してください。不一致なら中止します。発行元の署名の代わりではありません。', 'Windows では下のファイル名を実際の名前に変えます。Mac は shasum -a 256、Linux は sha256sum の後にファイルのパスを指定します。'], code: 'Get-FileHash -Algorithm SHA256 .\\AioLM_0.3.2_x64-setup.exe' }] },
      { id: 'updates', title: 'あとで更新する', body: ['左の設定 → 一般で更新を確認します。新しい版があれば作業を保存してダウンロードとインストールを選びます。システム側のインストールを完了し、AioLM を開き直します。'], image: 'updates', caption: '設定にあるアプリ更新欄です。この例では v0.3.2 を使っています。', more: [{ title: 'バックアップ・削除・手動更新', body: ['Mac の DMG は既存アプリを置き換えます。AppImage・手動インストールはダウンロードページを使います。アプリの置き換えでは会話と設定は残ります。', 'データは Mac/Linux の ~/.aiolm、Windows の %USERPROFILE%\\.aiolm、または AIOLM_HOME の指定先にあります。このフォルダーとモデルをバックアップしてください。', 'Windows EXE（NSIS）の削除ではデータ削除を選べます。MSI・DEB の削除と Mac アプリをゴミ箱へ移す操作ではデータは残ります。'] }, { title: '更新の検証範囲', body: ['v0.3.2 のパッケージ検査は通過しました。実際の v0.3.1 → v0.3.2 更新インストールとデバイス UI 検証は未完了です。'] }] },
    ] },
    'getting-started': { title: '最初の会話を始める', description: 'モデルは会話する AI のファイル、エンジンはそれを動かすプログラムです。初めてなら llama.cpp と小さなテキストモデルで始めましょう。', sections: [
      { id: 'language', title: '1. 言語を選ぶ', body: ['日本語を選び「次へ」を押します。初回はこの画面から始まります。設定済みなら 4 番へ進んでください。'], image: 'language', caption: '選んだ言語にボタンや説明が切り替わります。' },
      { id: 'theme', title: '2. 画面の色を選ぶ', body: ['ライト・ダーク・システムから好みを選び「次へ」を押します。あとで設定から変更できます。'], image: 'theme', caption: 'テーマを選ぶとすぐにプレビューできます。' },
      { id: 'folder', title: '3. モデルの保存先を選ぶ', body: ['既定のフォルダーを使うか「フォルダーを選択」で別の場所を選びます。「AioLMを始める」で作業画面が開きます。まだモデルがなくても大丈夫です。'], image: 'folder', caption: '例のパスを入力せず、自分のコンピューターのフォルダーを選んでください。' },
      { id: 'engine', title: '4. エンジンを準備する', body: ['左の推論エンジンを開き llama.cpp を選びます。コンピューターに合う推奨項目のインストールを押し、完了を待ちます。'], image: 'llama-install', caption: 'GPU を使わない CPU 専用の例です。自分の機器では推奨項目とバージョンが異なることがあります。', note: 'ランタイムはインストール済みエンジンのことです。vLLM・MLX を使う場合は先に「自分の機器に合うエンジン」を読んでください。' },
      { id: 'download', title: '5. 小さなモデルを取得する', body: ['左のモデル検索画面で llama.cpp と GGUF を選び、モデルを検索します。リポジトリを選ぶと右にファイルが出ます。', 'まず小さなテキストモデルを選びます。ファイル横のダウンロードを押し、完了を待ちます。使用条件と必要メモリーも確認してください。'], image: 'model-files', caption: '検索とダウンロードの位置を示す例です。表示モデルの互換性や回答品質を保証する画面ではありません。' },
      { id: 'library', title: '6. 取得したファイルを探す', body: ['左のモデル実行画面を開き、ダウンロードしたファイル名を押します。見つからない場合はモデルフォルダーが保存先と同じか確認し、再検索します。'], image: 'model-library', caption: 'モデル一覧から、自分が取得したファイル名を選びます。' },
      { id: 'model', title: '7. 取得したモデルを選ぶ', body: ['モデル実行画面で取得したファイルを押します。モデル選択・設定でエンジンとインストール済みランタイムを選び、プロファイル、オプションの順に進みます。プロファイルは設定のまとまりです。初めはデフォルトを選びます。', '初めは既定値のまま進めます。必要項目を確認して実行します。準備できていない項目は、画面に表示された理由を先に解決してください。'], image: 'model-settings', caption: '上の 1 番のランタイム選択からこの画面を開きます。右側でインストールした項目を選びます。表示のインストール状態は説明用です。', more: [{ title: 'モデルを読み込めません', body: ['エンジンとモデルが合うか、メモリーが足りるか確認します。準備状態の案内とエンジンログを先に読み、知らないオプションをむやみに変えないでください。', 'コンテキストは一度に参照する会話の量です。大きすぎるとメモリー不足になります。コンテキスト・並列数・起動オプションを変えると再起動が必要です。'] }] },
      { id: 'chat', title: '8. 短いメッセージを送る', body: ['モデルを読み込んだら左のチャットを開きます。下の欄に短い質問を書き、送信を押します。', '先にテキストの会話を試してください。画像・音声・動画・ツールはモデルとエンジンの両方が対応する場合に使えます。'], image: 'chat', caption: '入力欄の位置を示しています。モデル読み込み前なので送信は無効です。先に 7 番でモデルを実行してください。', more: [{ title: '速度を測ったり結果を共有したい', body: ['ベンチマークは処理速度を測ります。同じ測定方法と作業で比較してください。高い点数は回答品質や全機能の検証ではありません。', '共有は任意でブラウザー確認が必要です。公開内容を先に確認し、アカウントなしで管理できるよう復旧コード・バックアップは非公開で保管します。アプリから管理を開くか、このサイトの管理画面を使います。'] }] },
    ] },
    compatibility: { title: '自分の機器に合うエンジン', description: '迷ったら llama.cpp から始めてください。vLLM・MLX・外部推論エンジンは機器やモデルによって準備が変わります。', sections: [
      { id: 'engines', title: 'エンジン一覧を開く', body: ['左の推論エンジンを押します。このデバイスで利用不可と表示されたエンジンは選ばないでください。'], image: 'engines', caption: '基本提供のエンジンもインストールが必要です。一覧にあるだけではインストール済みではありません。' },
      { id: 'choose', title: 'どのエンジンを選ぶ？', table: { headers: ['エンジン', '選ぶ場面'], rows: [['llama.cpp', 'Windows・Mac・Linux で GGUF から始める'], ['vLLM', '対応する Linux アクセラレーター環境を用意済み'], ['vLLM · vllm-metal', 'Apple silicon Mac、macOS 15+ で vLLM を使う'], ['MLX', 'Apple silicon Mac で MLX モデルを使う'], ["外部推論エンジン", '例：Strata・TensorFold。別途インストールしたエンジンと互換アダプターを用意する']] }, note: 'Intel Mac では MLX・vllm-metal は使えません。インストール画面の条件を確認してください。' },
      { id: 'models', title: '合う形式のモデルを取得', body: ['llama.cpp は GGUF ファイルを使います。vLLM・MLX は通常、モデル・設定・tokenizer がそろったフォルダーが必要です。1 ファイルだけコピーせず、検索画面で対応形式を選びます。', 'メモリーが足りなければ小さなモデルを試します。画像・音声にはモデル説明とアプリの対応表示も確認してください。'], image: 'discover', caption: '検索画面の上でエンジンとモデル形式を先に選びます。', more: [{ title: 'vLLM・MLX の詳細な条件', body: ['Linux の管理対象 vLLM は CUDA 依存関係を使います。AMD ROCm はドライバーに合う Python 環境を別途準備して登録します。AioLM はシステム GPU ドライバーをインストールしません。', 'vllm-metal は Apple silicon・macOS 15+・ネイティブ arm64 Python 3.12 が必要です。Intel・Rosetta Python は非対応です。MLX も Apple silicon と互換 Python 環境が必要です。', 'ネイティブ Windows vLLM・WSL・リモートサーバーはローカル実行対象ではありません。Python モデルは完全な safetensors または対応 MLX スナップショットが必要です。vllm-metal の GGUF 対応は一部に限られます。'] }] },
      { id: 'limits', title: 'まだ確認が必要な点', body: ['画像・音声・動画・ツールはモデルとエンジンの両方が対応する必要があります。登録だけで全機能が使えるわけではありません。'], more: [{ title: 'v0.3.2 の検証範囲と既知の問題', body: ['SmolVLM の画像・動画の内容品質の失敗（F09）は未解決です。', 'パッケージのビルド成功は、全機器での推論を検証した意味ではありません。Linux 全体と実際の v0.3.1 → v0.3.2 更新インストール・UI 検証も未完了です。', 'ベンチマーク・詳細検証・ポータブルバンドルはエンジンごとに対応が異なります。外部推論エンジン（custom.*）は現在の公開ベンチマーク共有対象ではありません。'] }] },
    ] },
    adapters: {
      "title": "外部推論エンジンを接続",
      "description": "外部推論エンジンは、自分で別途インストールしてAioLMに接続するプログラムです。Strata・TensorFoldもその例で、他の外部エンジンと同じ接続設定・互換性確認が必要です。標準搭載や自動インストールではありません。",
      "sections": [
        {
          "id": "prepare",
          "links": [{"href": "/ja/guides/external-engines", "label": "エンジン別の接続ファイル"}],
          "title": "接続に必要なものを確認",
          "body": [
            "エンジンとAioLM用アダプターを用意します。アダプターはエンジンの起動、モデル確認、メッセージ交換をつなぐプログラムです。",
            "エンジンまたはbridgeがOpenAI互換HTTP/SSEを提供し、AioLM用のモデル互換性検査（probe）に応答する必要があります。この共通規格を満たせば、アプリにエンジン名を追加する必要はありません。任意の実行ファイルを選ぶだけで接続できるわけではありません。"
          ]
        },
        {
          "id": "files",
          "title": "どのファイルを選ぶ？",
          "table": {
            "headers": [
              "用意したもの",
              "選ぶファイル・場所"
            ],
            "rows": [
              [
                "AioLM用設定パッケージ",
                "フォルダー全体を展開し、読み込みで*.setup.jsonを選択します。同梱ファイルも一緒に保管します。"
              ],
              [
                "サーバー実行ファイル",
                "手動登録で実際のサーバー（例：llama-server.exe、llama-server）を選びます。インストーラーやショートカットは選びません。"
              ],
              [
                "Pythonスクリプト・モジュール",
                "エンジンをインストールした環境のpython.exe（Windows）またはbin/python（Mac/Linux）を選び、スクリプトやモジュールを下の引数に入れます。"
              ],
              [
                "モデル・通常の設定",
                "モデル（.gguf、.safetensors）は登録後のモデル選択で指定します。deployment.jsonなどはアダプターが別の入力欄で求めた場合だけ選びます。AioLM接続設定とは別です。"
              ]
            ]
          },
          "note": "*.setup.jsonは名前の例です。内容がAioLM setup v1形式である必要があり、通常のJSONの名前を変えるだけでは使えません。"
        },
        {
          "id": "add",
          "title": "1. 推論エンジンを追加",
          "body": [
            "実行中のモデルを停止し、左の推論エンジン → 推論エンジンを追加を選びます。設定ファイルがあれば2、なければ3へ進みます。"
          ],
          "image": "adapter-add",
          "caption": "外部エンジンを追加する場所です。特定の提供者を選ぶ必要はありません。"
        },
        {
          "id": "setup",
          "title": "2. 接続設定があれば読み込む",
          "steps": [
            "アダプター設定を読み込むを押し、展開したフォルダーのAioLM用*.setup.jsonを選びます。",
            "提供者の説明に従い、必要なプログラム・フォルダー・ファイルを指定します。コマンドを確認し、インストールを確認して続行を押して4へ進みます。"
          ],
          "code": "展開したアダプターフォルダー/\n  engine.setup.json  ← 読み込みで選択\n  prepare.py        ← 一緒に保管\n  probe.py          ← 一緒に保管",
          "note": "v0.3.2の「付属アダプターを表示」は、以前のStrata設定例1件を開くメニューです。インストール済みエンジンの検索やエンジンのインストールは行わず、接続に必須でもありません。",
          "more": [
            {
              "title": "設定ファイルがない場合",
              "body": [
                "AioLM setup v1 JSON、同梱する設定用・probeプログラム、対応OS・Python・モデル形式、選ぶ実行ファイルを提供者に確認してください。アダプターがなければ開発者が共通規格に対応する必要があります。Strata・TensorFoldも同じ条件です。"
              ]
            }
          ]
        },
        {
          "id": "manual",
          "title": "3. 設定がなければ手動登録",
          "body": [
            "実行ファイルまたはインタープリター → 参照で上の表に合うプログラムを選びます。Pythonスクリプトはファイル引数を追加、モジュールは引数を追加で-mと実際のモジュール名を別々に入れます。",
            "表示名、エンジンID（custom.*形式、例：custom.my-engine）、ランタイムID（例：local-1）を入れ、次へを押します。モデル・ポートのオプションやprobeが不明なら提供者に確認してください。"
          ],
          "image": "adapter-setup",
          "caption": "公開済みv0.3.2の共通手動登録画面です。Example Engineとパスは説明用で、自分の実際のファイルを選びます。",
          "more": [
            {
              "title": "直接サーバーとbridgeの選び方",
              "body": [
                "エンジンがOpenAI互換HTTP/SSEを提供するなら直接提供を選びます。そうでなければ変換するbridgeが必要です。別のbridgeを選び、提供者の説明に従ってプログラム・引数・エンジンJSON argv環境変数を設定します。通常のコンソール入出力が自動でHTTPサーバーになるわけではありません。"
              ]
            },
            {
              "title": "Pythonモジュールの起動例",
              "body": [
                "提供者のコマンドが「python -m vendor_engine.serve」なら、そのPythonを選び、引数を2欄に分けます。モジュール名は実際にインストールしたものに置き換えます。"
              ],
              "code": "実行ファイル：環境のpython.exeまたはbin/python\n引数1：-m\n引数2：vendor_engine.serve"
            }
          ]
        },
        {
          "id": "help",
          "title": "4. 起動方法を確認",
          "body": [
            "ヘルプを探索で選択したプログラムのオプションを読みます。失敗したらファイル、Python環境、必要なライブラリーを確認します。ヘルプの表示だけではモデル推論の成功を証明しません。"
          ],
          "image": "adapter-help",
          "caption": "選択したコマンドのヘルプ確認です。この画像は実行成功の証拠ではありません。"
        },
        {
          "id": "check",
          "title": "5. モデル接続と互換性検査を確認",
          "body": [
            "モデル・ポートのオプションを提供者の説明と合わせます。全エンジンが--model・--portとは限りません。読み込んだ値も確認します。",
            "互換性確認プログラムにはAioLM用probeを指定します。Pythonの場合はPythonを選び、引数にprobe.pyのパスや{model}を別々に入れます。通常のエンジン実行ファイルはprobeの代わりになりません。"
          ],
          "image": "adapter-check",
          "caption": "上にモデル・ポート接続、下にprobe・状態確認・モデル形式があります。例のprobe.pyは付属ファイルではありません。",
          "more": [
            {
              "title": "開発者向けの共通条件",
              "body": [
                "probeはschema_version: 1、登録したengine_id・runtime_id、モデルパス、対応可否と機能をJSONで返します。非対応モデルは失敗のままにします。HTTP/SSE、状態確認パス、モデル・ポート・認証の渡し方も実際のサーバーと一致する必要があります。表示名や拡張子の変更で代用はできません。"
              ]
            }
          ]
        },
        {
          "id": "review",
          "title": "6. 登録して実際のモデルを動かす",
          "steps": [
            "登録内容を確認 → 登録を押します。モデル選択で新しいエンジン・ランタイムと対応モデルファイルまたは完全なモデルフォルダーを選びます。",
            "モデル互換性検査を通過してから実行します。短い質問への回答、生成キャンセル後の再質問、停止・再起動を確認します。"
          ],
          "image": "adapter-review",
          "caption": "共通登録内容の最終確認です。登録成功と推論成功は別の確認です。"
        },
        {
          "id": "trouble",
          "title": "接続できない場合",
          "more": [
            {
              "title": "Pythonやファイルが見つからない",
              "body": [
                "エンジンをインストールした環境のPythonを選んでください。JSONだけでなく同梱ファイルを含むフォルダー全体を保管します。プログラムやアダプターを移動・変更した場合は再読込し、ヘルプ・互換性を確認して再登録します。"
              ]
            },
            {
              "title": "登録できたがモデルが動かない",
              "body": [
                "モデル形式、全ファイル、メモリー、エンジンのライブラリーを確認し、互換性結果とサーバーログを読みます。非対応の画像・音声・ツール機能は登録だけでは追加されません。"
              ]
            },
            {
              "title": "登録削除でエンジンやモデルも消える？",
              "body": [
                "外部プログラム・モデルは削除しません。鍵は提供者の指定する環境変数で渡します。外部エンジンの公開ベンチマーク共有・詳細検証・移動用バンドルには別途対応が必要です。"
              ]
            }
          ]
        },
        {
          "id": "verified",
          "title": "実際に確認した範囲",
          "body": [
            "2026-10-28：公開v0.3.2 CLIで外部CPU llama-server b11669をcustom.independent-cpuとして登録し、固定Qwen2.5-0.5Bモデルを実行しました。実際の回答「5」、トークン数、ストリームキャンセル、再起動、削除・再登録、終了後のポート解放を確認しました。",
            "このLinux CPU構成のCLI検証です。Strata・TensorFoldの実際の推論や全外部エンジンの互換性を保証しません。画像は例示データです。今回の検査でネイティブUI、実際の更新インストール、Linux全体の受入検証が完了したわけではありません。"
          ],
          "more": [
            {
              "title": "再現情報",
              "report": {"href": "/verification/external-cpu-2026-10-28.json", "label": "実行検証結果を表示 (JSON)"},
              "body": [
                "サーバー：ggml-org/llama.cpp b11669。モデルrevision：9217f5db79a29953eb74d5343926648285ec7e67。公式アーカイブ・モデルのSHA-256と41ファイルを検査し、元ファイルが変わらないことも確認しました。正常なプロセス回収の下でA01–A09が通過しました。最初のコンテナ回収失敗は別記録として保存しています。F09は未解決です。"
              ]
            }
          ]
        }
      ]
    },
    'external-engines': {
      "title": "エンジン別の接続ファイル",
      "description": "接続対象として指定された16エンジンです。すべてがインストール済み・検証済みという意味ではありません。自分のエンジンを開き、必要なプログラムとモデルを確認してください。",
      "sections": [
        {
          "id": "choose",
          "title": "自分のエンジンを選択",
          "body": [
            "インストールメニューではありません。Strata・TensorFoldを含め、すべての外部エンジンに同じ接続規格と実行検査を適用します。"
          ],
          "more": [
            {
              "title": "1. Halogen",
              "body": [
                "条件: Strix Halo · Linux · ROCm",
                "選ぶ実行ファイル: podman / docker + Halogen image",
                "モデルの準備: モデル専用の重み・tokenizer・追加ファイル一式。一般GGUFと同じと仮定しないでください。",
                "コンテナ内の実行ファイルは通常のホストファイル選択では指定できません。イメージ、GPU、モデルマウント、コンテナ終了を管理するアダプターが必要で、まだ提供していません。",
                "現在の検証状態: この環境で実際の推論は未検証・対応完了ではありません"
              ],
              "links": [
                {
                  "href": "https://github.com/peonist-ai/halogen-server",
                  "label": "公式プロジェクト · peonist-ai/halogen-server"
                },
                {
                  "href": "https://github.com/peonist-ai/halogen-flash-server",
                  "label": "公式プロジェクト · peonist-ai/halogen-flash-server"
                }
              ]
            },
            {
              "title": "2. Strixite",
              "body": [
                "条件: Strix Halo · Linux",
                "選ぶ実行ファイル: build/strix/strix_server",
                "モデルの準備: モデル専用の重み・tokenizer・追加ファイル一式。一般GGUFと同じと仮定しないでください。",
                "起動・モデル・ポート接続とAioLM用probeが必要です。引数は配置例で、MODEL/HOST/PORTは実際の値に置き換えます。",
                "現在の検証状態: この環境で実際の推論は未検証・対応完了ではありません"
              ],
              "links": [
                {
                  "href": "https://github.com/shawnshekari/strixite",
                  "label": "公式プロジェクト · shawnshekari/strixite"
                }
              ],
              "code": "起動方法の例: --config DEDICATED_CONFIG"
            },
            {
              "title": "3. MLX (mlx-lm / MLX-VLM)",
              "body": [
                "条件: Apple Silicon · macOS",
                "選ぶ実行ファイル: installed Python",
                "モデルの準備: 重み・設定・tokenizerを含む完全なローカルチェックポイント",
                "起動・モデル・ポート接続とAioLM用probeが必要です。引数は配置例で、MODEL/HOST/PORTは実際の値に置き換えます。",
                "現在の検証状態: この環境で実際の推論は未検証・対応完了ではありません",
                "mlx-lmとMLX-VLMは別のサーバーモジュールです。テキスト・画像対応もモデルとモジュールごとに確認します。"
              ],
              "links": [
                {
                  "href": "https://github.com/ml-explore/mlx-lm",
                  "label": "公式プロジェクト · ml-explore/mlx-lm"
                },
                {
                  "href": "https://github.com/Blaizzy/mlx-vlm",
                  "label": "公式プロジェクト · Blaizzy/mlx-vlm"
                }
              ],
              "code": "起動方法の例: -m mlx_lm.server / mlx_vlm.server"
            },
            {
              "title": "4. ExLlamaV3 (ExLlamaV2)",
              "body": [
                "条件: NVIDIA GPU · supported CUDA environment",
                "選ぶ実行ファイル: TabbyAPI environment Python + main.py",
                "モデルの準備: V3はEXL3、V2はEXL2など、対応する完全なモデルフォルダー",
                "デスクトップアプリやライブラリーではなくサーバーを使います。設定・モデル/ポート・プロセス所有権をつなぐアダプターが必要で、汎用接続パッケージはまだ提供していません。",
                "現在の検証状態: この環境で実際の推論は未検証・対応完了ではありません",
                "公式推奨サーバーはTabbyAPIです。exllamav3/exllamav2ライブラリーやCUDA DLL自体を選びません。"
              ],
              "links": [
                {
                  "href": "https://github.com/turboderp-org/exllamav3",
                  "label": "公式プロジェクト · turboderp-org/exllamav3"
                },
                {
                  "href": "https://github.com/turboderp-org/exllamav2",
                  "label": "公式プロジェクト · turboderp-org/exllamav2"
                },
                {
                  "href": "https://github.com/theroyallab/tabbyAPI",
                  "label": "公式プロジェクト · theroyallab/tabbyAPI"
                }
              ],
              "code": "起動方法の例: main.py"
            },
            {
              "title": "5. Rulith Inference",
              "body": [
                "条件: Strix Halo · Windows 11; Linux build is separate",
                "選ぶ実行ファイル: bin/hip/llama-server.exe",
                "モデルの準備: そのエンジンが対応するGGUFと必要な付属ファイル",
                "デスクトップアプリやライブラリーではなくサーバーを使います。設定・モデル/ポート・プロセス所有権をつなぐアダプターが必要で、汎用接続パッケージはまだ提供していません。",
                "現在の検証状態: この環境で実際の推論は未検証・対応完了ではありません",
                "デスクトップEXEではなく専用パッチサーバーが対象です。ROCm DLL、環境、モデル配置も合わせる必要があります。"
              ],
              "links": [
                {
                  "href": "https://github.com/rulith-dev/rulith-inference",
                  "label": "公式プロジェクト · rulith-dev/rulith-inference"
                }
              ]
            },
            {
              "title": "6. SGLang",
              "body": [
                "条件: supported SGLang device/build · Linux",
                "選ぶ実行ファイル: installed Python",
                "モデルの準備: 重み・設定・tokenizerを含む完全なローカルチェックポイント",
                "起動・モデル・ポート接続とAioLM用probeが必要です。引数は配置例で、MODEL/HOST/PORTは実際の値に置き換えます。",
                "現在の検証状態: この環境で実際の推論は未検証・対応完了ではありません"
              ],
              "links": [
                {
                  "href": "https://github.com/sgl-project/sglang",
                  "label": "公式プロジェクト · sgl-project/sglang"
                }
              ],
              "code": "起動方法の例: -m sglang.launch_server"
            },
            {
              "title": "7. vLLM",
              "body": [
                "条件: supported vLLM device/build · Linux; vllm-metal is separate",
                "選ぶ実行ファイル: vllm / installed Python",
                "モデルの準備: 重み・設定・tokenizerを含む完全なローカルチェックポイント",
                "起動・モデル・ポート接続とAioLM用probeが必要です。引数は配置例で、MODEL/HOST/PORTは実際の値に置き換えます。",
                "現在の検証状態: この環境で実際の推論は未検証・対応完了ではありません"
              ],
              "links": [
                {
                  "href": "https://github.com/vllm-project/vllm",
                  "label": "公式プロジェクト · vllm-project/vllm"
                }
              ],
              "code": "起動方法の例: serve MODEL"
            },
            {
              "title": "8. Strata",
              "body": [
                "条件: supported Windows/Linux engine build",
                "選ぶ実行ファイル: installed Python + matching adapter",
                "モデルの準備: 確認したrevision用の専用deployment JSONと参照する全ファイル",
                "デスクトップアプリやライブラリーではなくサーバーを使います。設定・モデル/ポート・プロセス所有権をつなぐアダプターが必要で、汎用接続パッケージはまだ提供していません。",
                "現在の検証状態: この環境で実際の推論は未検証・対応完了ではありません",
                "既存SDK例はsource 296b59d2f73c8f04a805df29c2fa97655adace78限定です。現在のStrata launchコマンドの対応を意味しません。"
              ],
              "links": [
                {
                  "href": "https://github.com/Niko1221/Strata",
                  "label": "公式プロジェクト · Niko1221/Strata"
                }
              ],
              "code": "起動方法の例: -m serve.server"
            },
            {
              "title": "9. TensorFold",
              "body": [
                "条件: supported Metal / CUDA / Vulkan build",
                "選ぶ実行ファイル: tensorfold",
                "モデルの準備: 重み・設定・tokenizerを含む完全なローカルチェックポイント",
                "起動・モデル・ポート接続とAioLM用probeが必要です。引数は配置例で、MODEL/HOST/PORTは実際の値に置き換えます。",
                "現在の検証状態: この環境で実際の推論は未検証・対応完了ではありません"
              ],
              "links": [
                {
                  "href": "https://github.com/ashhart/TensorFold",
                  "label": "公式プロジェクト · ashhart/TensorFold"
                }
              ],
              "code": "起動方法の例: serve MODEL"
            },
            {
              "title": "10. vllm.cpp",
              "body": [
                "条件: matching CPU / CUDA / Metal / Vulkan / ROCm build",
                "選ぶ実行ファイル: bin/vllm-server",
                "モデルの準備: 対応するGGUFまたは完全なチェックポイント。量子化とモデル構造も確認します。",
                "起動・モデル・ポート接続とAioLM用probeが必要です。引数は配置例で、MODEL/HOST/PORTは実際の値に置き換えます。",
                "現在の検証状態: 固定Linux CPU・モデルのCLI検査通過・汎用アダプター公開や全機器検証ではありません",
                "v0.0.2 CPUでQwen3.5-0.8B Q8_0と公式tokenizer_config.jsonを--tokenizer-configで指定して通過しました。Qwen2.5のロード失敗は維持し、テンプレートなしの反復回答も成功扱いにしていません。"
              ],
              "links": [
                {
                  "href": "https://github.com/localai-org/vllm.cpp",
                  "label": "公式プロジェクト · localai-org/vllm.cpp"
                },
                {
                  "href": "/verification/vllm-cpp-cpu-2026-10-28.json",
                  "label": "実行検査記録"
                }
              ],
              "code": "起動方法の例: --model MODEL"
            },
            {
              "title": "11. Mistral.rs",
              "body": [
                "条件: matching CPU / CUDA / Metal build",
                "選ぶ実行ファイル: mistralrs",
                "モデルの準備: 対応するGGUFまたは完全なチェックポイント。量子化とモデル構造も確認します。",
                "起動・モデル・ポート接続とAioLM用probeが必要です。引数は配置例で、MODEL/HOST/PORTは実際の値に置き換えます。",
                "現在の検証状態: 固定Linux CPU・モデルのCLI検査通過・汎用アダプター公開や全機器検証ではありません"
              ],
              "links": [
                {
                  "href": "https://github.com/EricLBuehler/mistral.rs",
                  "label": "公式プロジェクト · EricLBuehler/mistral.rs"
                },
                {
                  "href": "/verification/mistralrs-cpu-2026-10-28.json",
                  "label": "実行検査記録"
                }
              ],
              "code": "起動方法の例: serve"
            },
            {
              "title": "12. KTransformers",
              "body": [
                "条件: supported CPU + accelerator combination",
                "選ぶ実行ファイル: installed Python + SGLang/kt-kernel",
                "モデルの準備: SGLang用の全モデルとkt-kernel用expert重み・設定",
                "起動・モデル・ポート接続とAioLM用probeが必要です。引数は配置例で、MODEL/HOST/PORTは実際の値に置き換えます。",
                "現在の検証状態: この環境で実際の推論は未検証・対応完了ではありません"
              ],
              "links": [
                {
                  "href": "https://github.com/kvcache-ai/ktransformers",
                  "label": "公式プロジェクト · kvcache-ai/ktransformers"
                }
              ],
              "code": "起動方法の例: -m sglang.launch_server"
            },
            {
              "title": "13. ik_llama.cpp",
              "body": [
                "条件: matching CPU / CUDA / Vulkan build",
                "選ぶ実行ファイル: build/bin/llama-server",
                "モデルの準備: そのエンジンが対応するGGUFと必要な付属ファイル",
                "起動・モデル・ポート接続とAioLM用probeが必要です。引数は配置例で、MODEL/HOST/PORTは実際の値に置き換えます。",
                "現在の検証状態: この環境で実際の推論は未検証・対応完了ではありません"
              ],
              "links": [
                {
                  "href": "https://github.com/ikawrakow/ik_llama.cpp",
                  "label": "公式プロジェクト · ikawrakow/ik_llama.cpp"
                }
              ]
            },
            {
              "title": "14. Mullama",
              "body": [
                "条件: matching CPU / GPU build",
                "選ぶ実行ファイル: mullama",
                "モデルの準備: そのエンジンが対応するGGUFと必要な付属ファイル",
                "起動・モデル・ポート接続とAioLM用probeが必要です。引数は配置例で、MODEL/HOST/PORTは実際の値に置き換えます。",
                "現在の検証状態: この環境で実際の推論は未検証・対応完了ではありません"
              ],
              "links": [
                {
                  "href": "https://github.com/cognisoc/mullama",
                  "label": "公式プロジェクト · cognisoc/mullama"
                }
              ],
              "code": "起動方法の例: serve --model MODEL"
            },
            {
              "title": "15. llama.cpp",
              "body": [
                "条件: matching Windows / macOS / Linux build",
                "選ぶ実行ファイル: llama-server.exe / llama-server",
                "モデルの準備: そのエンジンが対応するGGUFと必要な付属ファイル",
                "起動・モデル・ポート接続とAioLM用probeが必要です。引数は配置例で、MODEL/HOST/PORTは実際の値に置き換えます。",
                "現在の検証状態: 固定Linux CPU・モデルのCLI検査通過・汎用アダプター公開や全機器検証ではありません"
              ],
              "links": [
                {
                  "href": "https://github.com/ggml-org/llama.cpp",
                  "label": "公式プロジェクト · ggml-org/llama.cpp"
                },
                {
                  "href": "/verification/external-cpu-2026-10-28.json",
                  "label": "実行検査記録"
                }
              ]
            },
            {
              "title": "16. Gufo",
              "body": [
                "条件: Strix Halo · Linux x86_64",
                "選ぶ実行ファイル: gufo",
                "モデルの準備: そのエンジンが対応するGGUFと必要な付属ファイル",
                "起動・モデル・ポート接続とAioLM用probeが必要です。引数は配置例で、MODEL/HOST/PORTは実際の値に置き換えます。",
                "現在の検証状態: この環境で実際の推論は未検証・対応完了ではありません",
                "host・portはserveのオプション、modelはllmのオプションです。この順序を保つmanifestかbridgeが必要です。"
              ],
              "links": [
                {
                  "href": "https://github.com/gufo-org/gufo",
                  "label": "公式プロジェクト · gufo-org/gufo"
                }
              ],
              "code": "起動方法の例: serve --host HOST --port PORT llm --model MODEL"
            }
          ]
        },
        {
          "id": "rules",
          "title": "一覧にあってもすぐ動くとは限りません",
          "body": [
            "実行ファイル、設定、モデルは別の役割です。ライブラリーやインストーラーを適当に選ばないでください。互換アダプターがない項目は、AioLM用設定・probe・必要なbridgeの実装と検証が先に必要です。"
          ]
        },
        {
          "id": "verification",
          "title": "対応完了の条件",
          "body": [
            "登録、実際のヘルプと引数、モデル検査、HTTP/SSEの回答とトークン数、キャンセル後の再質問、停止・再起動、削除・再登録、終了後のプロセス・ポート回収を確認します。専用GPU機器で実行していない項目は未検証のままにします。"
          ]
        }
      ]
    },
  },
};
export default content;
