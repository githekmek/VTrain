import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',timeout:30000,workers:1,
 use:{baseURL:'http://127.0.0.1:4173',serviceWorkers:'block',screenshot:'only-on-failure'},
 webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:false},
 projects:[
  {name:'android-chromium',use:{...devices['Pixel 7']}},
  {name:'ios-webkit',use:{...devices['iPhone 13']}}
 ]
});
