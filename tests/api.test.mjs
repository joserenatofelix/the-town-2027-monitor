import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

function moduleUrl(source) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const monitorUrl = moduleUrl(await readFile(new URL('../netlify/lib/monitor.ts', import.meta.url), 'utf8'));
const apiSource = await readFile(new URL('../netlify/functions/api.mts', import.meta.url), 'utf8');
const { default: handler, config } = await import(moduleUrl(apiSource.replace('../lib/monitor.js', monitorUrl)));

test('API sem persistência: consultas, métodos e falhas', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  assert.deepEqual(config.path, ['/api/status', '/api/check']);

  await t.test('GET retorna JSON sem cache e ignora scripts e estilos', async () => {
    globalThis.fetch = async () => new Response('<style>vendas abertas</style><script>compre agora</script><p>The Town 2027</p>');
    const response = await handler(new Request('https://example.test/api/status'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.fase, 'checked');
    assert.equal(body.situacaoIngressos, 'nao-confirmado');
    assert.deepEqual(body.palavrasEncontradas, ['2027']);
    assert.ok(body.ultimaConsulta);
  });

  await t.test('POST consulta novamente e identifica sinal de venda', async () => {
    globalThis.fetch = async () => new Response('<p>Ingressos disponíveis — Slipknot 2027</p>');
    const response = await handler(new Request('https://example.test/api/check', { method: 'POST' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sinalVenda, true);
  });

  await t.test('indisponibilidade prevalece sobre sinais de venda', async () => {
    globalThis.fetch = async () => new Response('<p>Compre agora. Ingressos esgotados.</p>');
    const response = await handler(new Request('https://example.test/api/status'));
    const body = await response.json();
    assert.equal(body.situacaoIngressos, 'indisponivel');
    assert.equal(body.sinalVenda, false);
  });

  await t.test('métodos inválidos não consultam o site', async () => {
    globalThis.fetch = async () => { throw new Error('Não deveria consultar'); };
    const response = await handler(new Request('https://example.test/api/status', { method: 'POST' }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
  });

  await t.test('falha externa retorna 502 com estado de erro, sem detalhes internos', async () => {
    globalThis.fetch = async () => { throw new Error('Detalhe interno de conexão'); };
    const response = await handler(new Request('https://example.test/api/status'));
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.fase, 'error');
    assert.equal(body.sinalVenda, false);
    assert.equal(body.mensagem.includes('Detalhe interno'), false);
  });
});
