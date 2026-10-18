# Appends translations to src/lib/en.ts: python3 scripts/add-i18n.py <json file with {"German": "English"}>
import json, sys
p = "src/lib/en.ts"
s = open(p, encoding="utf-8").read()
add = json.load(open(sys.argv[1], encoding="utf-8"))
lines = "".join(f"  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)},\n" for k, v in add.items() if f"{json.dumps(k, ensure_ascii=False)}:" not in s)
i = s.rindex("};")
open(p, "w", encoding="utf-8").write(s[:i] + lines + s[i:])
