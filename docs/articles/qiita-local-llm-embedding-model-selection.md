# Windowsアプリに搭載するLLMを選定した

個人で作っているElectron製のローカル完結ノートアプリ（hanamask）に「意味検索」を付けるため、**インストーラーに同梱する日本語向けの埋め込みモデル**を選びました。この記事は、その選定条件・候補比較・採用理由と、採用に至るまでに踏んだ落とし穴のメモです。

## TL;DR

- 条件は **再配布可能なOSSライセンス／日本語品質／小さい（〜300MB）／llama.cppで動く** の4つ
- 選んだのは **cl-nagoya/ruri-v3-70m**（Apache-2.0、Q8_0で約77MB、JMTEB平均73.95）。次点は intfloat/multilingual-e5-small（MIT、約132MB、67.38）
- ただし **公開されているRuriのGGUFはトークナイザが壊れていて濁点が消える**。自前でGGUF化し（変換スクリプトへ1箇所パッチ）、Hugging Faceのsentence-transformers出力とcos ≥ 0.9998で一致するのを確認してから採用した
- 推論エンジン側（node-llama-cpp）にも落とし穴が2つ（BOSが付かない／batchSizeの既定値でpoolingが壊れる）。どちらも **エラーは出ず、静かに精度が落ちる**

## 背景: なぜ「同梱」なのか

hanamaskは、AIエージェント（Claude Code等）がMCP経由でノート・タスクを読み書きするローカルアプリです。既存の検索はキーワード一致だけなので、「WSLからMCPにつなぐときの詰まりどころ」と書いたノートは「Windows側への接続でハマった話」では出てきません。エージェントが作業前に過去の経緯を引くとき、この取りこぼしがそのまま「同じ調査を二度やる」につながります。

そこで埋め込みベクトルによる意味検索を足すことにしました。方針として **外部のOllama等に依存せず、推論エンジンとモデルをアプリに組み込む** ことにしています。理由は次の3つです。

- 利用者に別ソフトの導入を求めない（インストーラーだけで動く）
- 記録の内容を外に送らない（完全ローカル、APIキー不要）
- インストール直後から動く

この方針だと「何を同梱するか」がそのまま設計判断になります。

## 選定条件

| 条件 | 理由 |
|---|---|
| 再配布可能なOSSライセンス（Apache-2.0 / MIT 等） | インストーラーに同梱して配布するため。非商用限定・独自ライセンスは除外 |
| 日本語主体で品質を評価 | 利用者のノートは日本語がメイン。「多言語対応」の看板ではなく日本語ベンチマーク（JMTEB）で見る |
| 小さい（量子化後50〜300MB） | インストーラー増分。現行が約118MBなので倍以上にはしたくない |
| llama.cpp（node-llama-cpp）で動く | Electron mainプロセスに同梱する推論エンジンがllama.cppのため。アーキテクチャ対応とGGUFの有無 |

## 候補比較（2026年8月時点）

| モデル | Params | 次元 | ライセンス | JMTEB平均 | GGUFサイズ（Q8_0） | 判定 |
|---|---|---|---|---|---|---|
| **cl-nagoya/ruri-v3-70m** | 70M | 384 | Apache-2.0 | **73.95** | **約77MB**（自前変換） | **採用** |
| cl-nagoya/ruri-v3-30m | 37M | 256 | Apache-2.0 | 72.95 | 約41MB | さらに小さくしたい場合の代替 |
| intfloat/multilingual-e5-small | 118M | 384 | MIT | 67.38 | 約132MB（公開GGUFあり） | 次点（変換リスクゼロ） |
| BAAI/bge-m3 | 568M | 1024 | MIT | 72.46 | 約635MB | サイズ超過 |
| pkshatech/GLuCoSE-base-ja-v2 | 133M | 768 | Apache-2.0 | 71.11 | — | llama.cpp未対応（LukeModel） |
| Snowflake/snowflake-arctic-embed-m-v2.0 | 305M | 768 | Apache-2.0 | 未掲載 | — | llama.cpp未対応 |
| sbintuitions/sarashina-embedding-v1-1b | 1.2B | 1792 | 非商用限定 | 74.87 | — | ライセンスで除外 |
| google/embeddinggemma-300m | 303M | 768 | Gemma Terms | 70.59 | — | 独自ライセンスで除外 |
| Qwen/Qwen3-Embedding-0.6B | 596M | 1024 | Apache-2.0 | Retrieval 72.81 | 約639MB | サイズ超過、日本語ではRuriに劣後 |

JMTEBの値はsbintuitionsの公式リーダーボード（2025-10スナップショット）から。**Ruri v3 70mはbge-m3を上回りつつサイズが約1/8**、というのが決め手でした。

除外の判断で効いたのは **ライセンス**（sarashinaは品質最上位だが非商用限定、EmbeddingGemmaはGemma Termsの下流伝播義務）と **llama.cpp対応**（GLuCoSE・arcticは変換スクリプトにアーキテクチャの登録が無い）の2つです。性能表だけ見ていると選んでしまう候補が、この2条件で落ちます。

## 落とし穴1: 公開されているRuriのGGUFは使えなかった

Hugging FaceにはRuri v3 30m/70mのGGUFが公開されています。ところがヘッダを見ると `tokenizer.ggml.model = bert`（WordPiece）になっていました。Ruri v3はSentencePieceの **Unigram** トークナイザなので、これをWPMとして解釈すると、llama.cpp側の正規化（lowercase・strip_accentsが既定でオン）で **濁点・半濁点付きのひらがなが丸ごと消えます**。

実測では「ぱぴぷぺぽ・ばびぶべぼ・がぎぐげご」が空トークンになり、HF出力との一致度はcos min 0.777 / mean 0.840。エラーは一切出ず、検索精度だけが黙って落ちる状態でした。

### 自前変換

llama.cppの変換スクリプト（`conversion/bert.py`）の `ModernBertModel.set_vocab` はBPE固定です。`tokenizer.model` があるとき（＝Ruriのようなsentencepiece派生）だけ、SentencePieceのUnigramをllama.cppのUGM（`tokenizer.ggml.model = "t5"`）に載せる分岐を足しました。

```python
def set_vocab(self):
    self.gguf_writer.add_add_bos_token(True)
    self.gguf_writer.add_add_eos_token(True)
    self.gguf_writer.add_add_sep_token(True)
    if (self.dir_model / "tokenizer.model").is_file():
        # ModernBERT-Ja 派生（cl-nagoya/ruri-v3-*）は SentencePiece Unigram
        return self._modernbert_unigram_set_vocab()
    self._set_vocab_gpt2()
```

`_modernbert_unigram_set_vocab` の中身は「SentencePieceProcessorで語彙・スコア・トークン種別を読み、`add_tokenizer_model("t5")` で書く」だけです。ここで `_set_vocab_sentencepiece()` を使うと `llama`（SPM＝スコア貪欲マージ）扱いになりViterbiにならないので、**`t5`（UGM）に載せるのがポイント**でした。

```bash
python convert_hf_to_gguf.py ./ruri-v3-70m --outfile ruri-v3-70m-q8_0.gguf --outtype q8_0
```

`--outtype q8_0` が直接使えるので `llama-quantize` のビルドは不要。poolingは `1_Pooling/config.json` のmean設定を変換スクリプトが拾って `pooling_type = MEAN` を自動で書いてくれます。

## 落とし穴2: node-llama-cpp側の2点

自前GGUFでも初回計測はcos 0.91〜0.97で、原因が2つありました。

1. **BOSが付かない。** node-llama-cpp v3.20の `getEmbeddingFor(string)` はUGM語彙のときBOSを付けません（GGUFに `add_bos_token=True` が入っていても無視されます）。→ 文字列ではなくトークン配列で渡す
2. **`batchSize` の既定が `min(contextSize, 512)`。** 512トークンを超える入力がubatch分割され、poolingが壊れます（522トークンでcos 0.773）。→ `batchSize` を `contextSize` と同じにする

```js
const ctx = await model.createEmbeddingContext({ contextSize: 2048, batchSize: 2048 });
const tokens = [model.tokens.bos, ...model.tokenize(text), model.tokens.eos];
const { vector } = await ctx.getEmbeddingFor(tokens);
```

この2点を入れて **10文でcos min 0.999855 / mean 0.999902**、1554トークンの長文でも0.9999で一致しました。濁点・半濁点はトークン列がHFとバイト単位で完全一致しています。

どちらも「エラーにならず精度が落ちる」ので、**元モデルとの一致検証をやらずに組み込むと気づけません**。node-llama-cppを更新したときのために、検証スクリプト（Node側で埋め込み → Python側でsentence-transformersと比較）をリポジトリに残しました。

## 組み込み設計の要点

- 推論エンジン: `node-llama-cpp`（MIT）をElectron mainプロセスに同梱。CPU版プリビルドのみ（`@node-llama-cpp/win-x64`、約+10MB）。CUDA/Vulkanは入れない（利用者側にランタイムが要る上、小型の埋め込みモデルはCPUで十分速い）
- モデル: electron-builderの `extraResources` で `resources/models/` にGGUF・マニフェスト・LICENSEを同梱（asar内には置けない）
- マニフェスト（JSON）にプレフィックス（Ruriは「検索クエリ: 」「検索文書: 」が必須）・次元・contextSize・batchSize・ライセンスを持たせ、モデルの差し替えはこのファイルとGGUFの差し替えだけで済む形に
- ベクトルはL2正規化してSQLiteに保存し、内積でランキング。個人規模なのでJSで総当たりして十分（sqlite-vec等のネイティブ拡張は増やさない）
- 日本語埋め込みは無関係な文でも0.6〜0.8と類似度のフロアが高いので、**絶対値で足切りせず順位だけを見せる**
- 速度: CPUでモデルロード約3.6秒（初回のみ）、1文あたり約50ms

## ライセンス対応

- Ruri v3はApache-2.0。GGUF化・量子化は「改変」にあたるので、①ライセンス全文の同梱、②改変した旨（形式変換と8bit量子化のみ）、③帰属表示（cl-nagoya、元モデルURL）を行いました。HFリポジトリにはLICENSEファイルが無くREADMEのメタデータだけなので、全文はアプリ側で用意しています
- node-llama-cppはMIT。npm依存としてライセンス検査（許可リスト）を通し、NOTICEに載せる
- 公開GGUFは使えないので、自前変換したGGUFはアプリのリリースアセットとして配布し、ダウンロード時にsha256を検証（不一致は破棄）。取得元は固定URLのみ

## セキュリティで気にした点

- GGUFはネイティブコードがパースする形式なので、細工されたファイルによるパーサ脆弱性のリスクがある → sha256検証済みのファイル以外を読まない、node-llama-cppと `@node-llama-cpp/*` をlockfileで同一バージョンに固定
- 推論は完全ローカル。モデル取得（ビルド時）以外で通信が発生しないことをテストで固定
- モデルのロード失敗・推論例外は「意味検索だけ使えない」状態に畳み、アプリ本体を道連れにしない。`contextSize` はマニフェスト固定（`auto` にするとメモリを学習時最大まで確保しにいく）
- node-llama-cppはmainプロセス専用。IPC引数は型ガードで検証し、モデルパスはレンダラーやMCPから指定できない

## まとめ

- 日本語向けの小型埋め込みモデルは選択肢が増えていて、**Ruri v3 70mは約77MBでbge-m3を上回る**。ライセンスもApache-2.0で組み込みに向く
- ただし **「GGUFが公開されている＝そのまま使える」ではない**。トークナイザの種類が合っているか、poolingが入っているか、元モデルと出力が一致するかを実測してから採用する
- node-llama-cppのような薄いラッパーには、BOSやbatchSizeのように「静かに壊れる」設定がある。**元モデルとの一致検証を回帰テストとして残す**のが一番の保険だった

## 参考

- [cl-nagoya/ruri-v3-70m](https://huggingface.co/cl-nagoya/ruri-v3-70m)
- [JMTEB（sbintuitions）](https://github.com/sbintuitions/JMTEB)
- [node-llama-cpp](https://node-llama-cpp.withcat.ai/)
- [llama.cpp ModernBERT対応 PR #15641](https://github.com/ggml-org/llama.cpp/pull/15641)
- hanamaskリポジトリ内の検証手順とパッチ: `docs/local-llm/embedding-model-verification.md`、`scripts/embedding-model/`
