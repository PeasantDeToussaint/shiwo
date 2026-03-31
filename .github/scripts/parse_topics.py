import os, json

keys = [f"T{i}" for i in range(1, 21)]
topics = [os.environ.get(k, "").strip() for k in keys if os.environ.get(k, "").strip()]
output = "matrix={\"topic\":" + json.dumps(topics, ensure_ascii=False) + "}\n"

with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
    f.write(output)
