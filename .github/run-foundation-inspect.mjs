import { handler } from "./foundation-dry-run-lambda.ts";

const result = await handler();
console.log(JSON.stringify(result, null, 2));
if (!result?.dryRun || !result?.ok) process.exit(1);
