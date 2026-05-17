import { config } from "@remotion/eslint-config-flat";

export default [
  ...config,
  {
    files: ["src/Root.tsx", "src/schemas/videoProps.ts"],
    rules: {
      "@remotion/non-pure-animation": "off",
    },
  },
];
