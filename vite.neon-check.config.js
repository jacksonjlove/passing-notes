import config from "./vite.config.js";

export default {
  ...config,
  preview: {
    host: "127.0.0.1",
    port: 5187,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3007" },
  },
};
