# Monitor de ingressos The Town 2027

Monitor local para Windows que consulta a página oficial do The Town a cada 30 minutos, compara o texto recebido com a consulta anterior e alerta sobre alterações. Ao detectar uma mudança, envia uma notificação sonora e abre a página oficial para conferência manual.

O monitor não confirma disponibilidade de ingressos. Uma alteração pode ser apenas editorial ou visual, e o site pode carregar conteúdo por JavaScript que uma consulta HTTP simples não recebe.

## Requisitos

- Node.js LTS instalado e disponível no `PATH`
- Windows com acesso à internet

Confira a instalação no terminal:

```powershell
node -v
npm -v
```

## Executar

Abra esta pasta no VS Code e rode:

```powershell
npm install
npm start
```

O `npm start` compila o TypeScript, inicia o monitor e abre o painel local em `http://127.0.0.1:4173`. No painel, ajuste quantidade e tipo, cadastre os canais e use **Verificar agora** para disparar uma consulta imediata; o status e o relógio são atualizados automaticamente. Na primeira consulta, o conteúdo atual é salvo em `estado.json`. Uma mudança de texto gera notificação local e abre o site oficial. O aviso no topo só exibe “Ingressos à venda” ou “indisponíveis” quando encontra frases correspondentes; sem texto conclusivo, mostra “Disponibilidade não confirmada”. Esses sinais servem para conferência manual, não confirmam estoque. Para encerrar, pressione `Ctrl+C` no terminal.

### Configurar e-mail e WhatsApp

O cadastro do painel é local e não envia dados a um serviço de terceiros. Para habilitar e-mail, copie `.env.example` para `.env` e preencha os dados SMTP do provedor. Para WhatsApp, configure uma conta da WhatsApp Cloud API da Meta, um modelo de mensagem aprovado com uma variável no corpo e os valores correspondentes no `.env`. Use a versão da Graph API atualmente suportada pela Meta. Não cole tokens ou senhas no painel.

Sem a configuração do provedor, os contatos e preferências ficam salvos, mas nenhum e-mail ou WhatsApp será enviado. Contato e preferências são armazenados localmente em `preferencias.json`, ignorado pelo Git; credenciais ficam em `.env`, também ignorado pelo Git. Proteja esses arquivos como dados pessoais.

## Escopo e limitações

- A página monitorada é `https://thetown.com.br/pt/`; não há uma data presumida para abertura de vendas ou pré-venda.
- O monitor não faz login, não entra em fila virtual, não compra ingressos e não confirma estoque.
- Quantidade e tipo são preferências de alerta, não uma reserva. A elegibilidade da meia-entrada deve ser confirmada para cada beneficiário; o limite informado é de uma meia-entrada por CPF por dia, salvo a exceção oficial aplicável a pessoa com deficiência e acompanhante.
- O monitor não valida os contatos nem a elegibilidade, e não armazena CPFs ou dados de beneficiários.
- O computador precisa permanecer ligado, conectado à internet e com o processo em execução.
- A frequência de consulta é moderada (30 minutos). Evite reduzi-la para não sobrecarregar ou provocar bloqueios no site.

## Personalizar

O endereço, intervalo e caminho dos arquivos de estado estão no objeto `CONFIG` em `src/index.ts`. Os indicadores de venda estão em `indicadoresVenda`; podem não acompanhar o conteúdo carregado por JavaScript e não comprovam disponibilidade.

## Deploy na Netlify

A versão publicada na Netlify funciona sem banco de dados. O painel faz uma consulta ao abrir e permite novas consultas pelo botão **Verificar agora**. Não salva preferências, contatos ou histórico; não compara consultas anteriores e não envia alertas por e-mail ou WhatsApp. Não há consultas agendadas em segundo plano nesta versão.

Os arquivos em `public` são publicados como site estático. A função `netlify/functions/api.mts` atende `GET /api/status` e `POST /api/check`, consultando o site oficial em cada chamada. As respostas JSON usam `Cache-Control: no-store`. Uma falha na consulta externa retorna HTTP 502 com uma mensagem para o painel, em vez de indicar disponibilidade.

A configuração de publicação está em `netlify.toml`. O deploy não exige provisionamento de banco nem migrações, eliminando a dependência que causava o erro `403 — database feature not available for this account`. A correção do 404 depende da publicação das Functions junto com o painel.

As instruções de execução local acima descrevem o servidor original em `src/index.ts`, que pode continuar sendo executado separadamente com `npm start`. Os recursos locais de arquivos, alertas e agendamento não são executados na Netlify. O painel compartilhado agora apresenta apenas consultas sob demanda.

### Validação da API

Execute `node --test tests/api.test.mjs` para validar as rotas com respostas HTTP simuladas, sem consultar o site oficial ou usar armazenamento. A publicação é validada pelo fluxo de deploy da Netlify.
