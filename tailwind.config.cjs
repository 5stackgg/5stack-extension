/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("@5stack/ui/tailwind-preset")],
  content: [
    "./entrypoints/**/*.{html,vue,ts}",
    "./components/**/*.{vue,ts}",
    "./lib/**/*.ts",
  ],
};
