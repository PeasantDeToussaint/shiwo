import os, json

keys = ["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10"]
topics = [os.environ.get(k, "").strip() for k in keys if os.environ.get(k, "").strip()]
output = "matrix={\"topic\":" + json.dumps(topics, ensure_ascii=False) + "}\n"

with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
    f.write(output)
