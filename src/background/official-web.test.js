import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { officialWebRequest, handleOfficialWebMessage, OFFICIAL_WEB_KEY } from './official-web.js';
import { setChromeStorage } from '../../tests/mocks/chrome.js';
const FAKE = 'sk-synthetic-test-only';
const enabled = { searchProviders: ['deepseek-official'], webFetchProvider: 'deepseek-official' };
const sender = () => ({ id: chrome.runtime.id, url: chrome.runtime.getURL('static/official-web-settings.html') });
const reply = value => new Response(JSON.stringify(value), { status: 200 });
beforeEach(() => { chrome.runtime.id = 'test-extension'; setChromeStorage({ bds_settings: enabled, [OFFICIAL_WEB_KEY]: FAKE }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('official API boundary', () => {
 it('calls only fixed official endpoints with a background key, no cookies or redirect forwarding', async () => {
  const fetcher = vi.fn(async () => reply({ results: [{ title: 'Official fixture', url: 'https://example.com/doc', snippet: 'short', summary: 'long context' }] }));
  const result = await officialWebRequest('search', { query: 'fixture', endpoint: 'https://evil.example', apiKey: 'not-used' }, { fetcher });
  expect(fetcher).toHaveBeenCalledOnce();const [url,init]=fetcher.mock.calls[0];
  expect(url).toBe('https://api.deepseek.com/v1/tools/search');expect(init.headers.Authorization).toBe('Bearer '+FAKE);
  expect(init.credentials).toBe('omit');expect(init.redirect).toBe('error');
  expect(JSON.parse(init.body)).toEqual({ query: 'fixture', count: 10, need_content: false });
  expect(result.results[0].snippet).toBe('long context');expect(JSON.stringify(result)).not.toContain(FAKE);
 });
 it('accepts official Markdown without treating it as HTML', async () => {
  const fetcher=vi.fn(async()=>reply({title:'Markdown fixture',content:'# Heading\n\n**bold**'}));
  const result=await officialWebRequest('fetch',{url:'https://example.com/doc'},{fetcher});expect(result.content).toContain('**bold**');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({url:'https://example.com/doc'});
 });
 it('does not make any request when disabled or missing a key',async()=>{
  const fetcher=vi.fn();setChromeStorage({bds_settings:{},[OFFICIAL_WEB_KEY]:FAKE});
  await expect(officialWebRequest('search',{query:'x'},{fetcher})).rejects.toMatchObject({code:'disabled'});
  setChromeStorage({bds_settings:enabled});await expect(officialWebRequest('search',{query:'x'},{fetcher})).rejects.toMatchObject({code:'missing_key'});expect(fetcher).not.toHaveBeenCalled();
 });
 it('validates query code points without silent truncation',async()=>{
  const fetcher=vi.fn(async()=>reply({results:[]}));await officialWebRequest('search',{query:'😀'.repeat(128)},{fetcher});
  await expect(officialWebRequest('search',{query:'😀'.repeat(129)},{fetcher})).rejects.toMatchObject({code:'invalid_query'});
  expect(JSON.parse(fetcher.mock.calls[0][1].body).query).toBe('😀'.repeat(128));expect(fetcher).toHaveBeenCalledOnce();
 });
 it.each(['file:///etc/passwd','https://user:pass@example.com/','http://127.1/','http://2130706433/','http://localhost/','http://10.1.2.3/','http://192.168.1.1/','http://[::1]/','http://[::ffff:127.0.0.1]/'])('rejects unsafe URL %s before transmitting it',async url=>{
  const fetcher=vi.fn();await expect(officialWebRequest('fetch',{url},{fetcher})).rejects.toBeInstanceOf(Error);expect(fetcher).not.toHaveBeenCalled();
 });
 it.each([401,402,403,404,429,500])('reports HTTP %i without leaking upstream error bodies or retrying',async status=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({error:{message:FAKE}}),{status}));
  const e=await officialWebRequest('search',{query:'x'},{fetcher}).catch(e=>e);expect(e.status).toBe(status);expect(e.message).not.toContain(FAKE);expect(fetcher).toHaveBeenCalledOnce();
 });
 it('returns empty results distinctly and rejects malformed and oversized data',async()=>{
  expect((await officialWebRequest('search',{query:'x'},{fetcher:async()=>reply({results:[]})})).results).toEqual([]);
  await expect(officialWebRequest('search',{query:'x'},{fetcher:async()=>reply({bad:true})})).rejects.toMatchObject({code:'invalid_response'});
  await expect(officialWebRequest('fetch',{url:'https://example.com'},{fetcher:async()=>reply({title:'x',content:' '})})).rejects.toMatchObject({code:'invalid_response'});
  await expect(officialWebRequest('fetch',{url:'https://example.com'},{fetcher:async()=>reply({title:'x',content:'x'.repeat(4*1024*1024)})})).rejects.toMatchObject({code:'response_too_large'});
 });
 it('aborts timed out calls and cleans up the timeout',async()=>{
  vi.useFakeTimers();const fetcher=vi.fn((url,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('aborted')))));
  const result=officialWebRequest('search',{query:'x'},{fetcher,timeoutMs:50}).catch(e=>e);await vi.advanceTimersByTimeAsync(51);expect((await result).code).toBe('timeout');expect(vi.getTimerCount()).toBe(0);
 });
 it('redacts arbitrary transport exceptions',async()=>{
  await expect(officialWebRequest('search',{query:'x'},{fetcher:async()=>{throw Error('request failed '+FAKE)}})).rejects.toMatchObject({message:'Unable to reach the official web service.'});
 });
 it('allows key changes only from the extension-owned page, and returns status only',async()=>{
  const content={id:chrome.runtime.id,url:'https://chat.deepseek.com/'};
  await expect(handleOfficialWebMessage({type:'bds-official-web-settings',action:'save',apiKey:FAKE},content)).rejects.toMatchObject({code:'unauthorized'});
  await expect(handleOfficialWebMessage({type:'bds-official-web-settings',action:'status'},{id:chrome.runtime.id,url:'https://evil.example'})).rejects.toMatchObject({code:'unauthorized'});
  const saved=await handleOfficialWebMessage({type:'bds-official-web-settings',action:'save',apiKey:FAKE},sender());expect(saved).toEqual({configured:true});
  expect(await handleOfficialWebMessage({type:'bds-official-web-settings',action:'clear'},sender())).toEqual({configured:false});
  expect((await chrome.storage.local.get('bds_settings')).bds_settings).toEqual(enabled);
 });
});
