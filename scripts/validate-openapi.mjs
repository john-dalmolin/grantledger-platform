import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";

const openapiPath = path.resolve(
  process.cwd(),
  "docs/openapi/openapi.json",
);

await SwaggerParser.validate(openapiPath);
console.log(`OpenAPI is valid: ${openapiPath}`);