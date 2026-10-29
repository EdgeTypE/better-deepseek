// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { setChromeStorage } from '../mocks/chrome.js';
import { searchWeb, resolveSearchProviders } from '../../src/content/files/search-reader.js';
import { fetchAndConvertWebPage } from '../../src/content/files/web-reader.js';
import { handleOfficialWebMessage, OFFICIAL_WEB_KEY } from '../../src/background/official-web.js';
if (!File.prototype.text) File.prototype.text = function(){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsText(this)})};
const read=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsText(file)});
beforeEach(()=>{
 chrome.runtime.id='routing-test';setChromeStorage({bds_settings:{searchProviders:['deepseek-official'],webFetchProvider:'deepseek-official'},[OFFICIAL_WEB_KEY]:'sk-synthetic-routing-only'});
 vi.mocked(chrome.runtime.sendMessage).mockImplementation(async message=>{try{return{ok:true,data:await handleOfficialWebMessage(message,{id:chrome.runtime.id,url:'https://chat.deepseek.com/'})}}catch(e){return{ok:false,error:e.message}}});
});
afterEach(()=>vi.unstubAllGlobals());
it('routes ordinary and resolved/DeepResearch-style search plus deep reads through the official API',async()=>{
 const calls=[];vi.stubGlobal('fetch',vi.fn(async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify(url.endsWith('/search')?{results:[{title:'Fixture',url:'https://example.com/a',summary:'Verified fixture summary'}]}:{title:'Fixture page',content:'# Official Markdown\n\n正文完整'}))}));
 const providers=resolveSearchProviders(['deepseek-official']);expect(resolveSearchProviders(providers)[0].id).toBe('deepseek-official');
 const result=await searchWeb('fixture',1,()=>{},{providers});expect(result.provider).toBe('DeepSeek Official Search');const text=await read(result.file);expect(text).toContain('# Official Markdown');expect(text).toContain('正文完整');
 expect(calls.map(c=>c.url)).toEqual(['https://api.deepseek.com/v1/tools/search','https://api.deepseek.com/v1/tools/fetch']);
 expect(JSON.stringify(chrome.runtime.sendMessage.mock.calls)).not.toContain('sk-synthetic-routing-only');
 expect(await read(await fetchAndConvertWebPage('https://example.com/a'))).toContain('Official Markdown');
});
it('never silently falls back when official search or fetch fails',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('denied',{status:402})));
 await expect(searchWeb('fixture',0,()=>{},{providers:['deepseek-official','bing']})).rejects.toThrow('balance');
 expect(fetch).toHaveBeenCalledOnce();await expect(fetchAndConvertWebPage('https://example.com')).rejects.toThrow('balance');
 expect(chrome.runtime.sendMessage.mock.calls.every(([m])=>m.type==='bds-official-web')).toBe(true);
});
it('keeps browser Fetch available when the official reader is disabled',async()=>{
 setChromeStorage({bds_settings:{webFetchProvider:'browser'}});
 chrome.runtime.sendMessage.mockResolvedValue({ok:true,html:'<html><head><title>Browser fixture</title></head><body><article><h1>Browser reader</h1><p>'+('Original reader content. '.repeat(80))+'</p></article></body></html>'});
 const file=await fetchAndConvertWebPage('https://example.com/a');expect(await read(file)).toContain('Original reader content');expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({type:'bds-fetch-url',url:'https://example.com/a'});
});
