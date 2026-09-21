import type { EnglishMessages } from './en';
const messages = {
  "site.title": "AioLM — ローカルモデルをひとつのワークスペースで。",
  "site.description": "AioLM（All-in-One LM）はllama.cpp向けのデスクトップワークスペースです。GGUFモデルの探索、ランタイム管理、ローカルチャット、性能測定をひとつに。ユーザーが公開したベンチマークを実行環境とともに確認できます。",
  "site.skip": "本文へスキップ",
  "site.primary": "メインナビゲーション",
  "site.home": "ホーム",
  "site.benchmarks": "ベンチマーク",
  "site.manage": "管理",
  "site.github": "GitHubで見る",
  "site.tagline": "llama.cppのローカル言語モデル向けデスクトップワークスペース。",
  "site.project": "プロジェクト",
  "site.docs": "ドキュメント",
  "site.license": "MITライセンス",
  "site.language": "言語",
  "site.languageHint": "言語を変更すると、このページが選択した言語で開きます。",
  "site.notFound": "ページが見つかりません",
  "site.notFoundDetail": "このページは存在しないか、公開が終了しています。",
  "site.returnHome": "ホームに戻る"
} satisfies Record<keyof EnglishMessages, string>;
export default messages;
