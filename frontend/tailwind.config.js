/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme"); // ✅ Import defaultTheme

module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      // ✅ DEFINE FONT FAMILIES
      fontFamily: {
        // 'sans' will be the default font for the entire application
        sans: ["Inter", ...defaultTheme.fontFamily.sans],
        // 'poppins' can be used for headings or specific elements
        poppins: ["Poppins", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        primary: "#1890ff",
        secondary: "#52c41a",
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false, // Keep this disabled for Ant Design compatibility
  },
};
