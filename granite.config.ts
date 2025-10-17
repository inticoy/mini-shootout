import { defineConfig } from '@apps-in-toss/web-framework';

export default defineConfig({
  app: {
    identifier: 'mini-shootout', // Toss Apps 콘솔의 앱 이름과 동일하게 설정
  },
  brand: {
    displayName: 'Mini Shootout',
    iconPath: './public/icon.png',
    color: '#FF6B00', // 주요 브랜드 컬러
  },
  web: {
    host: 'localhost',
    port: 5173,
    devCommand: 'pnpm dev',
    buildCommand: 'pnpm build',
  },
});
