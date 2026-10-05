import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        wps: {
          brand: '#E64C3D',
          brandDark: '#C73E30',
          side: '#F5F6F8',
          border: '#E5E7EB',
          text: '#1F2937',
          subtext: '#6B7280'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif']
      }
    }
  },
  plugins: []
}

export default config
