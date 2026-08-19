> 2026-08-19 セット0（モデル検証スパイク）の報告。T48 SPEC Part 2「セット0の検証結果による確定事項」の根拠。

# セット0: Ruri v3 70m GGUF変換・検証スパイク 報告

## 判定

**cl-nagoya/ruri-v3-70m は合格。** 自前変換した GGUF (Q8_0) を node-llama-cpp v3.20.0 で読み込み、
Hugging Face sentence-transformers の出力と **全10文でコサイン類似度 min 0.999855 / mean 0.999902**（合格基準 ≥0.999）。
長文（522トークン・1554トークン）でも 0.9999 で一致。フォールバック（multilingual-e5-small）は不要のため未実施。

ただし**合格には以下2点の対処が必須**。どちらも欠けると静かに精度が落ちるだけでエラーは出ない（初回計測は 0.91〜0.97 だった）。

1. **BOSを明示的に付ける。** node-llama-cpp の `getEmbeddingFor(string)` は UGM 語彙のとき BOS を付けない
   （`dist/utils/tokenizerUtils.js` の `resolveBeginningTokenToPrepend` が `vocabularyType === ugm` で `null` を返す。
   EOS は付く）。GGUF 側に `add_bos_token=True` が入っていても無視される。
   → 文字列ではなく**トークン配列**を渡す: `ctx.getEmbeddingFor([model.tokens.bos, ...model.tokenize(text), model.tokens.eos])`
2. **`batchSize` を `contextSize` と同じにする。** 既定は `min(contextSize, 512)` で、かつ addon 側が `n_ubatch = n_batch` にする
   （`AddonContext.cpp:381`）。512トークンを超える入力はubatch分割され、pooling が壊れる（522トークンで cos 0.773）。
   → `createEmbeddingContext({contextSize: 8192, batchSize: 8192})`

**公開GGUF `keisuke-miyako/ruri-v3-70m-gguf-q8_0` は使ってはいけない**（詳細は後述）。自前変換版の配布が必要。

## 環境・コマンド

- llama.cpp: タグ **b10361** = `14e78ddef7a2061e7d5a31dce4eb7ee0bcdbc840`（node-llama-cpp 3.20.0 の同梱ビルドと同一。`llama/llama.cpp.info.json`）
- node-llama-cpp: **3.20.0**（プレビルドバイナリ linux-x64、CPUのみ）
- Python 3.12 / torch 2.13.0+cpu / sentence-transformers / gguf

```bash
python convert_hf_to_gguf.py ./ruri-v3-70m --outfile ruri-v3-70m-q8_0.gguf --outtype q8_0
```

`--outtype q8_0` が直接使えるので `llama-quantize` のビルドは不要。

## パッチ diff

上流の `ModernBertModel.set_vocab` は `_set_vocab_gpt2()`（BPE）固定。Ruri v3 は SentencePiece **Unigram** なので、
llama.cpp の Unigram 実装である **UGM（`tokenizer.ggml.model = "t5"`）** に載せ替える。
`_xlmroberta_set_vocab()` は流用不可（XLM-R 固有の `[<s>,<pad>,</s>,<unk>]` 先頭4トークン再配列があり、
Ruri の並び `[<unk>,<s>,</s>,<pad>]` を壊す。加えて Ruri の `tokenizer.json` は `normalizer: null` で
`precompiled_charsmap` の取り出しに失敗する）。`_set_vocab_sentencepiece()` も不可（"llama"=SPM になり、
Unigram Viterbi ではなくスコア貪欲マージになる）。

保存先: `scripts/embedding-model/ruri-modernbert-unigram.patch`（`conversion/bert.py` のみ、65行）

```diff
     def set_vocab(self):
         self.gguf_writer.add_add_bos_token(True)
         self.gguf_writer.add_add_eos_token(True)
         self.gguf_writer.add_add_sep_token(True)
+        if (self.dir_model / "tokenizer.model").is_file():
+            # ModernBERT-Ja derivatives (cl-nagoya/ruri-v3-*) ship a SentencePiece
+            # Unigram tokenizer instead of the BPE one the original ModernBERT uses.
+            return self._modernbert_unigram_set_vocab()
         self._set_vocab_gpt2()
+
+    def _modernbert_unigram_set_vocab(self) -> None:
+        os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"
+        from sentencepiece import SentencePieceProcessor
+        from sentencepiece import sentencepiece_model_pb2 as model
+
+        tokenizer_path = self.dir_model / "tokenizer.model"
+        sentencepiece_model = model.ModelProto()
+        sentencepiece_model.ParseFromString(open(tokenizer_path, "rb").read())
+        if sentencepiece_model.trainer_spec.model_type != 1:
+            raise NotImplementedError("ModernBert SentencePiece vocab must be UNIGRAM")
+
+        tokenizer = SentencePieceProcessor()
+        tokenizer.LoadFromFile(str(tokenizer_path))
+
+        vocab_size = max(self.hparams.get("vocab_size", 0), tokenizer.vocab_size())
+        tokens = [f"[PAD{i}]".encode("utf-8") for i in range(vocab_size)]
+        scores = [-10000.0] * vocab_size
+        toktypes = [SentencePieceTokenTypes.UNUSED] * vocab_size
+
+        for token_id in range(tokenizer.vocab_size()):
+            toktype = SentencePieceTokenTypes.NORMAL
+            if tokenizer.IsUnknown(token_id):   toktype = SentencePieceTokenTypes.UNKNOWN
+            elif tokenizer.IsControl(token_id): toktype = SentencePieceTokenTypes.CONTROL
+            elif tokenizer.IsUnused(token_id):  toktype = SentencePieceTokenTypes.UNUSED
+            elif tokenizer.IsByte(token_id):    toktype = SentencePieceTokenTypes.BYTE
+            tokens[token_id] = tokenizer.IdToPiece(token_id).encode("utf-8")
+            scores[token_id] = tokenizer.GetScore(token_id)
+            toktypes[token_id] = toktype
+
+        self.gguf_writer.add_tokenizer_model("t5")
+        self.gguf_writer.add_tokenizer_pre("default")
+        self.gguf_writer.add_token_list(tokens)
+        self.gguf_writer.add_token_scores(scores)
+        self.gguf_writer.add_token_types(toktypes)
+        self.gguf_writer.add_add_space_prefix(sentencepiece_model.normalizer_spec.add_dummy_prefix)
+        self.gguf_writer.add_remove_extra_whitespaces(sentencepiece_model.normalizer_spec.remove_extra_whitespaces)
+        self.gguf_writer.add_token_type_count(self.hparams.get("type_vocab_size", 1))
+        if precompiled_charsmap := sentencepiece_model.normalizer_spec.precompiled_charsmap:
+            self.gguf_writer.add_precompiled_charsmap(precompiled_charsmap)
+
+        special_vocab = gguf.SpecialVocab(self.dir_model, n_vocab=len(tokens))
+        special_vocab.add_to_gguf(self.gguf_writer)
```

`pooling_type` は**手当て不要**。`1_Pooling/config.json` の `pooling_mode_mean_tokens: true` を
上流の `_try_set_pooling_type()` が拾って MEAN(=1) を自動で書く。

## GGUF メタデータ（自前変換 Q8_0）

| キー | 値 |
|---|---|
| general.architecture | `modern-bert` |
| general.license | `apache-2.0` |
| tokenizer.ggml.model | `t5`（= UGM / Unigram） |
| tokenizer.ggml.pre | `default` |
| modern-bert.pooling_type | **1 (MEAN)** |
| modern-bert.context_length | 8192 |
| modern-bert.embedding_length | **384** |
| modern-bert.block_count | 13 |
| modern-bert.vocab_size | 102400 |
| modern-bert.attention.sliding_window / _pattern | 128 / 3 |
| modern-bert.rope.freq_base / _swa | 160000.0 / 10000.0 |
| tokenizer.ggml.add_bos_token / add_eos_token | True / True |
| tokenizer.ggml.add_space_prefix | False |
| bos / eos / unk / pad / sep / mask id | 1 / 2 / 0 / 3 / 4 / 5 |
| ファイルサイズ | 76,963,424 bytes (73.4 MiB) |
| sha256 | `5d1c83a92cf277e141819ef2403c5eab7fb2f71c5c48cb7e5a19044989f0a8a9` |

f32版も生成済（282,566,240 bytes, sha256 `b344d69cd725cfe598211c0e8b463024193fd181b8ccf882fb78b7082ab8eb68`）。Q8_0とf32で精度差はほぼ無い（後述）。

## 類似度（Node vs HF、Q8_0、BOS明示＋batchSize=8192）

| # | 文(先頭30字) | cos(Node,HF) |
|---|---|---|
| 0 | 検索クエリ: 瑠璃色はどんな色？ | 0.999907 |
| 1 | 検索文書: 瑠璃色（るりいろ）は、紫みを帯びた濃い青。名は、… | 0.999883 |
| 2 | 検索クエリ: ぱぴぷぺぽ・ばびぶべぼ・がぎぐげご の濁点と半… | 0.999898 |
| 3 | 検索文書: コーヒーメーカーのフィルターは、コーヒー豆の油分… | 0.999906 |
| 4 | トピック: データベースのインデックス設計とクエリ最適化 | 0.999908 |
| 5 | 検索文書: SQLiteのFTS5拡張は全文検索を提供し、b… | 0.999914 |
| 6 | 検索クエリ: Electronアプリで埋め込みモデルをローカ… | 0.999904 |
| 7 | 検索文書: node-llama-cpp v3.20.0 は… | 0.999855 |
| 8 | トピック: 東京タワーは1958年に完成した高さ333メート… | 0.999933 |
| 9 | 検索文書: 日本の四季は…（303字 / 135トークン） | 0.999912 |

**min=0.999855 / mean=0.999902 → 合格。** 長文追加検証: 522トークン 0.999911、1554トークン 0.999894。

### 意味的ペア（Node側の類似度行列、抜粋）

対角以外の上位が意味的に正しいペアになっている。HF側の同じ行列との最大差は 0.0024。

| ペア | 内容 | cos |
|---|---|---|
| 0–1 | 「瑠璃色はどんな色？」(クエリ) ↔ 瑠璃色の説明(文書) | **0.932** |
| 4–5 | DBインデックス設計 ↔ SQLite FTS5 | **0.848** |
| 6–7 | Electronで埋め込みローカル実行? ↔ node-llama-cppの説明 | **0.829** |
| 4–8 | DB設計 ↔ 東京タワー（無関係） | 0.810 |
| 0–6 | 瑠璃色クエリ ↔ Electronクエリ（無関係・最小） | 0.629 |

日本語モデル特有の高いフロア（無関係でも0.6〜0.8）があるので、**類似度の絶対値で足切りせずランキングで使うこと**。

## 濁点・半濁点

問題なし。トークナイズは HF と**バイト単位で完全一致**（文2で ID列 33個が HF の `input_ids[1:-1]` と完全一致）。

```
入力  : 検索クエリ: ぱぴぷぺぽ・ばびぶべぼ・がぎぐげご の濁点と半濁点をきちんと区別できますか？
pieces: ["検索","クエリ",":"," ","ぱ","ぴ","ぷ","ぺ","ぽ","・","ば","び","ぶ","べ","ぼ","・",
         "が","ぎ","ぐ","げ","ご"," ","の","濁","点","と","半","濁","点","をきちんと","区別","できますか","？"]
detokenize(tokenize(x)) == x （完全復元）
```

## 速度（CPU 16スレッド、GPUなし）

- モデルロード + createEmbeddingContext: **約3.6秒**（Q8_0 / f32 とも同じ。初回のみ）
- ロード後、1文あたり: **約50ms**（10文 497ms / 平均34トークン）
- トークン数別: 11tok=15ms / 35tok=32ms / 46tok=91ms / 135tok=257ms / 522tok≒0.9s / 1554tok≒2.7s
- f32 は Q8_0 より約1.3倍遅い（10文 460ms vs 350ms）。精度差はほぼ無い（f32でも min 0.913→修正前同等）ので **Q8_0 を採用**。

## hanamask への同梱推奨

```json
{
  "file": "ruri-v3-70m-q8_0.gguf",
  "dimensions": 384,
  "contextSize": 8192,
  "batchSize": 8192,
  "queryPrefix": "検索クエリ: ",
  "documentPrefix": "検索文書: ",
  "topicPrefix": "トピック: ",
  "license": "apache-2.0",
  "sha256": "5d1c83a92cf277e141819ef2403c5eab7fb2f71c5c48cb7e5a19044989f0a8a9",
  "sizeBytes": 76963424
}
```

- プレフィックスは Ruri v3 の「1+3方式」。検索クエリに `検索クエリ: `、ノート本文に `検索文書: `。
  分類・クラスタリング等トピック的な用途は `トピック: `。**プレフィックス無しは学習分布外なので必ず付ける。**
- 埋め込みは L2 正規化して保存し、内積でランキングする。
- 呼び出しは必ずトークン配列で（BOS問題）:
  ```js
  const ctx = await model.createEmbeddingContext({contextSize: 8192, batchSize: 8192});
  const tokens = [model.tokens.bos, ...model.tokenize(text), model.tokens.eos];
  const {vector} = await ctx.getEmbeddingFor(tokens);
  ```

### ダウンロード元

**公開GGUFはそのまま使えない。自前変換したGGUFを hanamask のリリースアセット等で配布する必要がある。**

唯一の既存公開GGUF `keisuke-miyako/ruri-v3-70m-gguf-q8_0`（`ruri-v3-70m-Q8_0.gguf`,
sha256 `ec58ad8676d448e91762ca04e08e6df4376221f2661f453d70fa83485b1672f9`）は**壊れている**:

- `tokenizer.ggml.model = 'bert'`（WordPiece）で変換されており、Unigram 語彙が WPM として解釈される
- 結果、**濁点・半濁点付きのひらがなが丸ごと消える**。「ぱぴぷぺぽ・ばびぶべぼ・がぎぐげご」が
  `[" 検"," 索"," クエリ"," :", "", " ・", "", " ・", "", " の", ...]` と空文字になる
- HF との一致度 **min 0.777 / mean 0.840**（不合格）
- ライセンス表記も無し（元がApache-2.0でも再配布物としてタグ無し）

自前変換版（sha256 `5d1c83a9…`）を配布物に含めるのが唯一の選択肢。元モデルが Apache-2.0 なので
帰属表示（cl-nagoya/ruri-v3-70m）と Apache-2.0 全文を同梱すれば再配布可。GGUF内の `general.license = apache-2.0` も保持されている。
なお **HFリポジトリに `LICENSE` ファイルは存在しない**（README front-matter の `license: apache-2.0` のみ）。
Apache-2.0 の全文は別途 hanamask 側で用意して同梱すること。

## 残課題

1. **配布の置き場と検証**: 自前変換GGUF（73.4MiB）をどこに置くか（GitHub Release アセット / HFに再アップロード）。
   ダウンロード後の sha256 検証を実装側に入れる。
2. **node-llama-cpp の BOS 問題は上流バグ**。`resolveBeginningTokenToPrepend` が UGM で `null` を返すのは
   llama.cpp 側が `add_bos_token` を見て付ける前提だが、embedding 経路ではトークナイズを JS 側で行うため付かない。
   トークン配列を渡す回避で問題ないが、**node-llama-cpp をバージョンアップしたら回帰確認が必要**
   （上流が修正するとBOSが二重に付く可能性がある。`getEmbeddingFor` は先頭が既にbosなら追加しない実装だが、
   `resolveBeginningTokenToPrepend` が返す値でしか判定しないので二重付与はしない見込み）。
   → **本スパイクの検証スクリプトを回帰テストとして `scripts/embedding-model/` に残した（手順は同ディレクトリの README.md）。**
3. **`batchSize` を上げるとメモリを食う**。8192トークン分のバッチで実測は未計測。ノートが長い場合の
   実メモリを測ってから決めること。あるいは埋め込み前にトークン数で分割する方針にするなら batchSize は
   その上限に合わせられる。
4. **13層は llama.cpp の `LLM_TYPE_UNKNOWN`**（`modern-bert.cpp` の switch に 13 が無い）。動作には影響しないが
   ログに "unknown" と出る。
5. 長文の分割戦略（ノート全文を1ベクトルにするか、チャンク分割するか）は未検討。8192トークンまで
   一致は確認済みだが、1554トークンで2.7秒かかるので**チャンク分割 + 上限トークン数**を推奨。
6. multilingual-e5-small フォールバックは Ruri 合格のため未検証。
