module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  ignorePatterns: ["dist", "node_modules"],
  overrides: [
    {
      files: ["packages/domain/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              "@grantledger/application*",
              "@grantledger/api*",
              "@grantledger/worker*",
              "@grantledger/admin*",
              "../../apps/*",
              "../../../apps/*",
            ],
          },
        ],
      },
    },
  ],
};
