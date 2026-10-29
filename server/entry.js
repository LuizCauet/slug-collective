import {createApp} from './app.js';
import assets from '../.local/assets.generated.js';
const app=createApp({staticHandler(request){const url=new URL(request.url);const path=url.pathname==='/'||/^\/events\/[a-zA-Z0-9-]+$/.test(url.pathname)?'/index.html':url.pathname;const asset=assets[path];if(!asset)return new Response('Not found',{status:404});if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const bytes=Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.type,'Cache-Control':/\.(png|jpg|svg|webp)$/.test(path)?'public, max-age=86400':'no-cache'}});}});
export default app;
