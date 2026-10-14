// Conexão com o PostgreSQL e criação das tabelas.
//
// As tabelas são criadas sozinhas na primeira consulta (CREATE TABLE IF NOT
// EXISTS): subir o sistema num banco vazio já basta, sem passo manual de
// migração. Um lock de transação evita corrida quando mais de um processo
// sobe ao mesmo tempo. Dinheiro sempre em centavos e energia em Wh (BIGINT).
import postgres from "postgres";
import { hashPassword } from "./auth";

const url = process.env.DATABASE_URL ?? "";

// Rede interna do Railway (ou banco local) não usa SSL; acesso de fora usa
// SSL quando o servidor oferece.
export const sql = postgres(url, {
  ssl: url.includes(".railway.internal") || url.includes("localhost") || url.includes("127.0.0.1") ? false : "prefer",
  max: 10,
  onnotice: () => {},
  types: {
    bigint: { to: 20, from: [20], serialize: (v: number) => String(v), parse: (v: string) => Number(v) },
  },
});

const SCHEMA = `
-- Busca por nome sem acento (sem depender da extensão unaccent).
CREATE OR REPLACE FUNCTION unaccent_simples(t TEXT) RETURNS TEXT AS $$
  SELECT translate(lower(t), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE IF NOT EXISTS configuracoes (
  id INT PRIMARY KEY CHECK (id = 1),
  dados JSONB NOT NULL DEFAULT '{}'
);

-- Parceiros que hospedam estações (hotel, condomínio, posto) e recebem repasse.
CREATE TABLE IF NOT EXISTS parceiros (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 2 AND 80),
  contato TEXT NOT NULL DEFAULT '',
  repasse_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (repasse_pct BETWEEN 0 AND 100),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Equipe do painel. admin: tudo; operador: opera estações e recargas;
-- parceiro: só as estações do próprio parceiro, sem comandos.
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 2 AND 80),
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'operador', 'parceiro')),
  parceiro_id INT REFERENCES parceiros(id),
  ativo BOOLEAN NOT NULL DEFAULT true,
  sessao_versao INT NOT NULL DEFAULT 1,
  ultimo_acesso TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (perfil <> 'parceiro' OR parceiro_id IS NOT NULL)
);

-- Estação = um carregador OCPP. "codigo" é a identidade dele na central
-- (o final da URL /ocpp/<codigo>). Senha OCPP só em hash.
CREATE TABLE IF NOT EXISTS estacoes (
  id SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE CHECK (codigo ~ '^[A-Za-z0-9._-]{3,40}$'),
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 2 AND 60),
  endereco TEXT NOT NULL DEFAULT '',
  bairro TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION CHECK (lat BETWEEN -90 AND 90),
  lng DOUBLE PRECISION CHECK (lng BETWEEN -180 AND 180),
  parceiro_id INT REFERENCES parceiros(id),
  ocpp_senha_hash TEXT,
  simulada BOOLEAN NOT NULL DEFAULT false,
  preco_kwh_centavos INT NOT NULL DEFAULT 189 CHECK (preco_kwh_centavos BETWEEN 1 AND 10000),
  custo_kwh_centavos INT NOT NULL DEFAULT 0 CHECK (custo_kwh_centavos BETWEEN 0 AND 10000),
  -- Limite de potência aplicado por comando (SetChargingProfile). null = sem limite.
  limite_w INT CHECK (limite_w IS NULL OR limite_w BETWEEN 1000 AND 1000000),
  -- Habilitada pela operação (ChangeAvailability). Desabilitada não aparece como disponível.
  habilitada BOOLEAN NOT NULL DEFAULT true,
  conectada BOOLEAN NOT NULL DEFAULT false,
  ultimo_contato TIMESTAMPTZ,
  conectada_em TIMESTAMPTZ,
  fabricante TEXT NOT NULL DEFAULT '',
  modelo TEXT NOT NULL DEFAULT '',
  firmware TEXT NOT NULL DEFAULT '',
  numero_serie TEXT NOT NULL DEFAULT '',
  status_geral TEXT NOT NULL DEFAULT 'Available',
  erro_geral TEXT NOT NULL DEFAULT 'NoError',
  ativa BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conectores (connectorId 1, 2...). Status cru do OCPP:
-- Available, Preparing, Charging, SuspendedEV, SuspendedEVSE, Finishing,
-- Reserved, Unavailable, Faulted.
CREATE TABLE IF NOT EXISTS conectores (
  id SERIAL PRIMARY KEY,
  estacao_id INT NOT NULL REFERENCES estacoes(id) ON DELETE CASCADE,
  numero INT NOT NULL CHECK (numero BETWEEN 1 AND 20),
  tipo TEXT NOT NULL DEFAULT 'CCS2',
  potencia_w INT NOT NULL DEFAULT 22000 CHECK (potencia_w BETWEEN 1000 AND 1000000),
  status TEXT NOT NULL DEFAULT 'Unavailable',
  erro TEXT NOT NULL DEFAULT 'NoError',
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (estacao_id, numero)
);

-- Motoristas (app). Saldo pré-pago em centavos: espelho da soma dos
-- movimentos, sempre atualizado na mesma transação. CPF só dígitos.
CREATE TABLE IF NOT EXISTS motoristas (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 2 AND 80),
  cpf TEXT NOT NULL UNIQUE CHECK (cpf ~ '^[0-9]{11}$'),
  celular TEXT NOT NULL CHECK (celular ~ '^[0-9]{10,11}$'),
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  senha_hash TEXT NOT NULL,
  veiculo TEXT NOT NULL DEFAULT '',
  placa TEXT NOT NULL DEFAULT '',
  conectores TEXT[] NOT NULL DEFAULT '{}',
  -- "Cartão virtual" usado no RemoteStartTransaction (idTag do OCPP).
  id_tag TEXT NOT NULL UNIQUE,
  saldo_centavos BIGINT NOT NULL DEFAULT 0,
  avisos_recarga BOOLEAN NOT NULL DEFAULT true,
  aceita_promocoes BOOLEAN NOT NULL DEFAULT false,
  consentimento_em TIMESTAMPTZ NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  sessao_versao INT NOT NULL DEFAULT 1,
  ultimo_acesso TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pagamentos para pôr crédito na carteira (Pix ou cartão).
CREATE TABLE IF NOT EXISTS pagamentos (
  id SERIAL PRIMARY KEY,
  motorista_id INT NOT NULL REFERENCES motoristas(id),
  metodo TEXT NOT NULL CHECK (metodo IN ('pix', 'cartao')),
  valor_centavos BIGINT NOT NULL CHECK (valor_centavos BETWEEN 100 AND 200000),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'expirado', 'recusado', 'cancelado')),
  provedor TEXT NOT NULL,
  provedor_id TEXT,
  pix_copia_cola TEXT,
  cartao_final TEXT,
  cartao_bandeira TEXT,
  expira_em TIMESTAMPTZ,
  pago_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provedor, provedor_id)
);
CREATE INDEX IF NOT EXISTS pagamentos_motorista_idx ON pagamentos (motorista_id, id DESC);

-- Extrato da carteira. Crédito de pagamento e débito de recarga são únicos
-- (pagamento/recarga não entram duas vezes).
CREATE TABLE IF NOT EXISTS carteira_movimentos (
  id SERIAL PRIMARY KEY,
  motorista_id INT NOT NULL REFERENCES motoristas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('credito', 'recarga', 'ajuste', 'estorno')),
  valor_centavos BIGINT NOT NULL CHECK (valor_centavos <> 0),
  descricao TEXT NOT NULL DEFAULT '',
  pagamento_id INT UNIQUE REFERENCES pagamentos(id),
  recarga_id INT UNIQUE,
  usuario_id INT REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carteira_motorista_idx ON carteira_movimentos (motorista_id, id DESC);

-- Recuperação de senha do motorista: só o hash do token, validade curta, uso único.
CREATE TABLE IF NOT EXISTS recuperacao_senha (
  id SERIAL PRIMARY KEY,
  motorista_id INT NOT NULL REFERENCES motoristas(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cartões/etiquetas aceitos no Authorize (RFID ou o "cartão virtual" do app).
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  id_tag TEXT NOT NULL UNIQUE CHECK (length(id_tag) BETWEEN 1 AND 20),
  descricao TEXT NOT NULL DEFAULT '',
  -- operacao: recarga de teste/serviço, sem cobrança.
  tipo TEXT NOT NULL DEFAULT 'operacao' CHECK (tipo IN ('operacao', 'motorista')),
  motorista_id INT,
  ativa BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recarga = transação OCPP. O transactionId devolvido ao carregador é o id.
CREATE TABLE IF NOT EXISTS recargas (
  id SERIAL PRIMARY KEY,
  estacao_id INT NOT NULL REFERENCES estacoes(id),
  conector_numero INT NOT NULL,
  id_tag TEXT NOT NULL,
  motorista_id INT,
  origem TEXT NOT NULL DEFAULT 'carregador' CHECK (origem IN ('carregador', 'painel', 'app')),
  usuario_id INT REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluida', 'interrompida', 'recusada')),
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ,
  medidor_inicio_wh BIGINT NOT NULL CHECK (medidor_inicio_wh >= 0),
  medidor_fim_wh BIGINT,
  energia_wh BIGINT NOT NULL DEFAULT 0 CHECK (energia_wh >= 0),
  potencia_w INT NOT NULL DEFAULT 0,
  soc INT,
  preco_kwh_centavos INT NOT NULL,
  custo_kwh_centavos INT NOT NULL DEFAULT 0,
  valor_centavos BIGINT NOT NULL DEFAULT 0 CHECK (valor_centavos >= 0),
  motivo_fim TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recargas_inicio_idx ON recargas (inicio DESC);
CREATE INDEX IF NOT EXISTS recargas_estacao_idx ON recargas (estacao_id, inicio DESC);
CREATE UNIQUE INDEX IF NOT EXISTS recargas_aberta_conector ON recargas (estacao_id, conector_numero) WHERE status = 'em_andamento';

-- Leituras do medidor durante a recarga (gráfico e cobrança por faixa de horário).
CREATE TABLE IF NOT EXISTS leituras (
  id BIGSERIAL PRIMARY KEY,
  recarga_id INT NOT NULL REFERENCES recargas(id) ON DELETE CASCADE,
  em TIMESTAMPTZ NOT NULL,
  medidor_wh BIGINT NOT NULL,
  potencia_w INT,
  soc INT
);
CREATE INDEX IF NOT EXISTS leituras_recarga_idx ON leituras (recarga_id, em);

-- Comandos enviados da central para os carregadores, com a resposta.
CREATE TABLE IF NOT EXISTS comandos (
  id SERIAL PRIMARY KEY,
  estacao_id INT NOT NULL REFERENCES estacoes(id) ON DELETE CASCADE,
  usuario_id INT REFERENCES usuarios(id),
  acao TEXT NOT NULL,
  descricao TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado', 'aceito', 'recusado', 'erro', 'sem_resposta', 'offline')),
  resposta JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondido_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS comandos_estacao_idx ON comandos (estacao_id, id DESC);

-- Registro das mensagens OCPP (diagnóstico). Limpo depois de 7 dias.
CREATE TABLE IF NOT EXISTS ocpp_mensagens (
  id BIGSERIAL PRIMARY KEY,
  estacao_id INT REFERENCES estacoes(id) ON DELETE CASCADE,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  acao TEXT,
  conteudo JSONB NOT NULL,
  em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ocpp_mensagens_idx ON ocpp_mensagens (estacao_id, id DESC);

-- Avisos para a equipe (sino). Resolvido some do sino.
CREATE TABLE IF NOT EXISTS avisos (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  estacao_id INT REFERENCES estacoes(id) ON DELETE CASCADE,
  recarga_id INT REFERENCES recargas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  texto TEXT NOT NULL DEFAULT '',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolvido_em TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS avisos_aberto_idx ON avisos (tipo, coalesce(estacao_id, 0), coalesce(recarga_id, 0)) WHERE resolvido_em IS NULL;

CREATE TABLE IF NOT EXISTS tentativas_falhas (
  id BIGSERIAL PRIMARY KEY,
  chave TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tentativas_falhas_idx ON tentativas_falhas (chave, criado_em);

-- Só inserção: quem fez o quê. Sem dado sensível no detalhe.
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  ator TEXT NOT NULL,
  acao TEXT NOT NULL,
  entidade TEXT,
  entidade_id INT,
  detalhe TEXT,
  ip TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tarifas por faixa de horário (horário de Brasília), iguais para todas as
-- estações. As faixas cobrem as 24 h sem sobrepor (conferido ao salvar). Sem
-- faixas, vale o preço cadastrado em cada estação. A tarifa que vale é a do
-- início da recarga.
CREATE TABLE IF NOT EXISTS tarifas (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 2 AND 30),
  hora_inicio INT NOT NULL CHECK (hora_inicio BETWEEN 0 AND 23),
  hora_fim INT NOT NULL CHECK (hora_fim BETWEEN 1 AND 24 AND hora_fim > hora_inicio),
  preco_kwh_centavos INT NOT NULL CHECK (preco_kwh_centavos BETWEEN 1 AND 10000),
  cor TEXT NOT NULL DEFAULT '#34B37A' CHECK (cor ~ '^#[0-9A-Fa-f]{6}$')
);

-- Vouchers de desconto (% sobre a tarifa). Cada motorista usa um código uma vez.
CREATE TABLE IF NOT EXISTS vouchers (
  id SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9]{3,20}$'),
  pct INT NOT NULL CHECK (pct BETWEEN 1 AND 100),
  descricao TEXT NOT NULL DEFAULT '',
  estacao_id INT REFERENCES estacoes(id),
  valido_ate DATE,
  limite_usos INT CHECK (limite_usos IS NULL OR limite_usos > 0),
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por INT REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS motorista_vouchers (
  id SERIAL PRIMARY KEY,
  motorista_id INT NOT NULL REFERENCES motoristas(id),
  voucher_id INT NOT NULL REFERENCES vouchers(id),
  origem TEXT NOT NULL DEFAULT 'resgate' CHECK (origem IN ('resgate', 'cortesia')),
  recarga_id INT UNIQUE,
  resgatado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  usado_em TIMESTAMPTZ,
  UNIQUE (motorista_id, voucher_id)
);

-- Inscrições de push (avisos no celular). Dono = alguém da equipe ou motorista.
-- Só vale enquanto a sessão (versão) for a mesma do momento da inscrição.
CREATE TABLE IF NOT EXISTS push_inscricoes (
  id SERIAL PRIMARY KEY,
  dono_tipo TEXT NOT NULL CHECK (dono_tipo IN ('equipe', 'motorista')),
  dono_id INT NOT NULL,
  sessao_versao INT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  usada_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_dono_idx ON push_inscricoes (dono_tipo, dono_id);

-- Caixa de avisos do motorista no app (recarga iniciada, concluída, saldo...).
CREATE TABLE IF NOT EXISTS avisos_motorista (
  id SERIAL PRIMARY KEY,
  motorista_id INT NOT NULL REFERENCES motoristas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  texto TEXT NOT NULL DEFAULT '',
  link TEXT,
  lido BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS avisos_motorista_idx ON avisos_motorista (motorista_id, id DESC);

-- Recarga do app parada por falta de saldo: marca para não pedir duas vezes.
ALTER TABLE recargas ADD COLUMN IF NOT EXISTS parada_solicitada BOOLEAN NOT NULL DEFAULT false;
-- Conta excluída (LGPD) fica sem CPF.
ALTER TABLE motoristas ALTER COLUMN cpf DROP NOT NULL;
-- Tarifa e desconto do início da recarga (preco_kwh_centavos já é o preço com desconto).
ALTER TABLE recargas ADD COLUMN IF NOT EXISTS tarifa_nome TEXT;
ALTER TABLE recargas ADD COLUMN IF NOT EXISTS preco_cheio_centavos INT;
ALTER TABLE recargas ADD COLUMN IF NOT EXISTS voucher_id INT REFERENCES vouchers(id);
ALTER TABLE recargas ADD COLUMN IF NOT EXISTS desconto_pct INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS recargas_motorista_idx ON recargas (motorista_id, inicio DESC) WHERE motorista_id IS NOT NULL;
`;

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = sql
      .begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('viva_schema')::bigint)`;
        await tx.unsafe(SCHEMA);
        await tx`INSERT INTO configuracoes (id, dados) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING`;
        // Primeiro admin, a partir das variáveis de ambiente, só quando ainda não existe ninguém.
        const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM usuarios`;
        const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
        const senha = process.env.INITIAL_ADMIN_PASSWORD;
        if (n === 0 && email && senha) {
          await tx`
            INSERT INTO usuarios (nome, email, senha_hash, perfil)
            VALUES (${process.env.INITIAL_ADMIN_NAME ?? "Administrador"}, ${email}, ${hashPassword(senha)}, 'admin')
          `;
        }
      })
      .then(() => undefined)
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
}
