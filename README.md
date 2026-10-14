# Viva Energia · Plataforma de eletropostos

App do motorista, painel de gestão e central OCPP 1.6J dos carregadores da Viva Energia Solar.
Desenvolvido pela Logos Company.

## Como funciona

- `server.mjs`: servidor customizado do Next. Atende o site e recebe os carregadores por WebSocket em
  `/ocpp/<código-da-estação>` (subprotocolo `ocpp1.6`, autenticação Basic: usuário = código, senha gerada no painel).
- `src/lib/ocpp/central.ts`: a central (mensagens do carregador, comandos, estado das conexões).
- `src/lib/ocpp/comandos.ts`: comandos da operação (reiniciar, iniciar/parar recarga, habilitar/desabilitar, potência).
- `src/lib/ocpp/simulador.ts`: carregadores virtuais que conectam na própria central (teste e demonstração).
- Tabelas criadas sozinhas na primeira subida (`src/lib/db.ts`). Dinheiro em centavos, energia em Wh.
- **Uma instância só**: as conexões dos carregadores ficam na memória do processo. Não escalar para mais de 1 réplica.

## App do motorista (raiz do site)

- Cadastro (CPF e celular validados, aceite do aviso de privacidade), login, recuperação de senha por e-mail.
- Mapa (Leaflet; imagens do mapa em `MAPA_TILES`), estação com escolha do conector, leitor de QR (câmera + jsQR) e
  QR impresso por conector (painel > estação > QR dos conectores) apontando para `/e/<código>/<conector>`.
- Carteira pré-paga (`src/lib/carteira.ts`): crédito por Pix ou cartão (`src/lib/pagamentos.ts`, provedor simulado até
  escolher o gateway), débito no fim da recarga, parada automática antes do saldo acabar.
- Recarga ao vivo, recibo, histórico, perfil e ajuda.

## Rodar local

1. Postgres na porta 5434 com o banco `viva_local`.
2. Copiar `.env.example` para `.env.local` e ajustar.
3. `npm install` e `npm run dev` → http://localhost:3400/painel
4. Dados de demonstração (6 estações simuladas, parceiros e histórico): com o sistema já tendo subido uma vez,
   `DATABASE_URL=... node scripts/seed-demo.mjs` e reiniciar.

## Produção (Railway)

- Build `npm run build`, start `npm start` (roda o `server.mjs`), healthcheck `/api/saude`.
- Backup diário: pasta `backup/` (serviço separado, cron), igual aos outros sistemas da Logos.
