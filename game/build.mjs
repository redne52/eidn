import * as esbuild from 'esbuild';
import fs from 'fs';
const r = await esbuild.build({ entryPoints:['src/main.js'], bundle:true, minify:true, format:'iife', write:false, loader:{'.json':'json','.glb':'dataurl'} });
const js = r.outputFiles[0].text.replace(/<\/script/g,'<\\/script');
const css = fs.existsSync('src/ui/style.css') ? fs.readFileSync('src/ui/style.css','utf8') : '';
const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><title>Edin</title><style>${css}</style></head><body><div id="app"></div><script>${js}</script></body></html>`;
fs.writeFileSync('dist/index.html', html);
console.log('dist/index.html', (html.length/1024).toFixed(0)+' KB');
