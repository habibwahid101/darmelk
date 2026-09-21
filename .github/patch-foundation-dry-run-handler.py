from pathlib import Path

p = Path("src/handler.ts")
text = p.read_text()
if "foundation-dry-run" in text:
    raise SystemExit("handler already patched unexpectedly")
old_imp = 'import { runMigrations, describeSchema } from "./migrate.js";'
new_imp = old_imp + '\nimport { handler as foundationDryRun } from "./foundation-dry-run-lambda.ts";'
if old_imp not in text:
    raise SystemExit("handler.ts import line not found; refusing to patch")
text = text.replace(old_imp, new_imp, 1)
needle = 'if (event.action === "describe")'
inject = (
    'if (event.action === "foundation-dry-run") {\n'
    "        return foundationDryRun();\n"
    "      }\n"
    '      if (event.action === "describe")'
)
if needle not in text:
    raise SystemExit("handler.ts missing describe action; refusing to patch")
p.write_text(text.replace(needle, inject, 1))
print("patched handler.ts with foundation-dry-run action")
