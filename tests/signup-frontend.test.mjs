import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const component = await readFile(new URL('../src/components/EmailOptIn.astro', import.meta.url), 'utf8');
const script = component.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];

async function guideForm(firstResponse) {
  const status = { textContent: '' };
  const submit = { disabled: false };
  const container = { dataset: {} };
  const firstName = { value: 'Test' };
  const alias = { value: '' };
  const listeners = {};
  const requests = [];
  const resets = [];
  let token = 'token-0';
  let usedToken;
  const form = {
    action: 'https://example.test/api/lead-magnet',
    querySelector: selector => ({
      '[data-turnstile-widget]': container,
      '.email-optin-status': status,
      'button[type="submit"]': submit,
      'input[name="firstName"]': firstName,
      '[data-first-name-alias]': alias,
    })[selector],
    addEventListener: (event, callback) => { listeners[event] = callback; },
    reset() {},
  };
  vm.runInNewContext(script, {
    document: { querySelectorAll: () => [form] },
    window: { turnstile: {
      render: () => 'guide-widget',
      reset: id => { resets.push(id); token = `token-${resets.length}`; },
    } },
    FormData: class { constructor() { this.token = token; } },
    fetch: async (url, options) => {
      if (url.endsWith('/config')) return { ok: true, json: async () => ({ siteKey: 'test-key' }) };
      requests.push(options.body.token);
      const duplicate = usedToken === options.body.token;
      usedToken = options.body.token;
      const result = requests.length === 1 ? firstResponse : duplicate
        ? { ok: false, body: { error: 'Verification failed: timeout-or-duplicate.' } }
        : { ok: true, body: { message: 'Check your inbox for your guide.' } };
      return { ok: result.ok, text: async () => JSON.stringify(result.body) };
    },
  });
  await new Promise(setImmediate);
  return {
    status, submit, requests, resets,
    send: () => listeners.submit({ preventDefault() {} }),
  };
}

test('guide signup refreshes its single-use verification token after a server failure so retry succeeds', async () => {
  const form = await guideForm({ ok: false, body: { error: 'Delivery temporarily unavailable.' } });
  await form.send();
  assert.equal(form.status.textContent, 'Delivery temporarily unavailable.');
  assert.equal(form.submit.disabled, false);
  await form.send();
  assert.equal(form.status.textContent, 'Check your inbox for your guide.');
  assert.deepEqual(form.requests, ['token-0', 'token-1']);
  assert.deepEqual(form.resets, ['guide-widget', 'guide-widget']);
});

test('guide signup also refreshes verification after successful submission', async () => {
  const form = await guideForm({ ok: true, body: { message: 'Check your inbox for your guide.' } });
  await form.send();
  assert.deepEqual(form.resets, ['guide-widget']);
  assert.equal(form.submit.disabled, false);
});

async function subscriberForm(file, oracle = false) {
  const source = await readFile(new URL('../src/components/'+file, import.meta.url),'utf8');
  const inline = source.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
  const status = {textContent:''},submit = {disabled:true},container = {},listeners = {},resets = [];
  const requests = [];
  const form = {dataset:{},action:'https://example.test/api/signup',
    querySelector:s=>s.endsWith('-status')?status:s==='button[type="submit"]'?submit:container,
    addEventListener:(event,callback)=>{listeners[event]=callback;},reset(){}};
  const waitlist = {open:true,querySelector:()=>form,addEventListener:(event,callback)=>{listeners.toggle=callback;}};
  vm.runInNewContext(inline,{
    document:{querySelectorAll:()=>oracle?[waitlist]:[form]},
    window:{turnstile:{render:()=> 'widget',reset:id=>resets.push(id)}},
    FormData:class{},
    fetch:async(url,options)=>{
      if(url.endsWith('/config'))return {ok:true,json:async()=>({siteKey:'local-key'})};
      requests.push(options);
      return {ok:requests.length>1,text:async()=>JSON.stringify(requests.length>1?{ok:true}:{error:'Temporary failure'})};
    },
  });
  if(oracle)listeners.toggle();
  await new Promise(setImmediate);
  return {status,submit,resets,requests,send:()=>listeners.submit({preventDefault(){}})};
}
for (const [file,oracle] of [['TarotNewsletter.astro',false],['OracleWaitlist.astro',true]]) {
  test(file+' connects safely and refreshes verification on retry',async()=>{
    const form=await subscriberForm(file,oracle);
    assert.equal(form.submit.disabled,false);
    await form.send();assert.equal(form.status.textContent,'Temporary failure');
    await form.send();assert.equal(form.submit.disabled,false);
    assert.equal(form.requests.length,2);assert.deepEqual(form.resets,['widget','widget']);
  });
}
