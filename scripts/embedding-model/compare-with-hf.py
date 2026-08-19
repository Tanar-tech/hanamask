# verify-embedding.mjs が出したベクトルを、Hugging Face の sentence-transformers 版と比べる。
#   python scripts/embedding-model/compare-with-hf.py <hf_model_dir> <node_out.json> [sentences.json]
# 合格基準: 全文で cos >= 0.999

import json, sys
import numpy as np
from sentence_transformers import SentenceTransformer

model_dir, node_file = sys.argv[1], sys.argv[2]
sentences_file = sys.argv[3] if len(sys.argv) > 3 else "scripts/embedding-model/sentences.json"
sents = json.load(open(sentences_file))

m = SentenceTransformer(model_dir, device="cpu")
hf = m.encode(sents, normalize_embeddings=True, batch_size=4)
node = np.array(json.load(open(node_file))["vectors"], dtype=np.float32)

print(f"hf shape {hf.shape} node shape {node.shape}")
print("\n| # | 文(先頭30字) | cos(Node,HF) |")
print("|---|---|---|")
cos = []
for i, s in enumerate(sents):
    c = float(np.dot(node[i], hf[i]))
    cos.append(c)
    print(f"| {i} | {s[:30]}… | {c:.6f} |")
print(f"\nmin={min(cos):.6f} mean={sum(cos)/len(cos):.6f}  PASS(>=0.999)={min(cos)>=0.999}")

print("\n意味的類似度行列 (Node側):")
sim = node @ node.T
print("     " + " ".join(f"{j:6d}" for j in range(len(sents))))
for i in range(len(sents)):
    print(f"{i:4d} " + " ".join(f"{sim[i][j]:6.3f}" for j in range(len(sents))))
print("\nHF側 同じ行列との最大差:", float(np.abs(sim - hf @ hf.T).max()))

sys.exit(0 if min(cos) >= 0.999 else 1)
