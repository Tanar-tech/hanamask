# 同梱する埋め込みモデル（GGUF）の変換と検証

同梱する `ruri-v3-70m-q8_0.gguf` は cl-nagoya/ruri-v3-70m を自前で変換したもの。既存の公開GGUFは
トークナイザが壊れているため使えない（経緯・実測値は `docs/local-llm/embedding-model-verification.md`）。

**変換**（llama.cpp b10361 = node-llama-cpp 3.20.0 の同梱ビルドと同一タグ）:

```bash
git -C llama.cpp apply /path/to/ruri-modernbert-unigram.patch   # conversion/bert.py: Unigram語彙をUGMで書く
python llama.cpp/convert_hf_to_gguf.py ./ruri-v3-70m --outfile ruri-v3-70m-q8_0.gguf --outtype q8_0
```

**検証**（Hugging Face 版と同じベクトルが出ることを確かめる。合格基準 cos >= 0.999）:

```bash
node scripts/embedding-model/verify-embedding.mjs ruri-v3-70m-q8_0.gguf scripts/embedding-model/sentences.json node.json
python scripts/embedding-model/compare-with-hf.py ./ruri-v3-70m node.json   # sentence-transformers が要る
```

**node-llama-cpp を更新したら必ず回すこと。** BOS の付与仕様と `batchSize` の既定値に依存しており、
どちらが変わっても例外は出ず精度だけが静かに落ちる。
