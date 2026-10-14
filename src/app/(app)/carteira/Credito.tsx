"use client";

import { useActionState, useState } from "react";
import { Ic } from "@/components/Ic";
import { brl } from "@/lib/format";
import { criarPix, pagarCartao, type Resposta } from "../acoes";

const VALORES = [3000, 5000, 10000, 20000];

// Bandeira pelo início do número (só para mostrar; quem valida é o gateway).
function bandeira(n: string) {
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(636368|438935|504175|451416|636297|5067|4576|4011|506699)/.test(n)) return "Elo";
  if (/^(606282|3841)/.test(n)) return "Hipercard";
  return "Cartão";
}

function luhn(n: string) {
  let s = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    s += d;
  }
  return n.length >= 13 && s % 10 === 0;
}

export function Credito({ simulado }: { simulado: boolean }) {
  const [valor, setValor] = useState(5000);
  const [metodo, setMetodo] = useState<"pix" | "cartao">("pix");
  const [rPix, enviarPix, gerando] = useActionState<Resposta, FormData>(criarPix, null);
  const [rCartao, enviarCartao, pagando] = useActionState<Resposta, FormData>(pagarCartao, null);
  const [numero, setNumero] = useState("");
  const [validade, setValidade] = useState("");
  const [cvv, setCvv] = useState("");
  const [erroCartao, setErroCartao] = useState<string | null>(null);
  const digitos = numero.replace(/\D/g, "");

  // O número completo nunca sai do navegador: só o final e a bandeira vão
  // ao servidor. Com o gateway de verdade, quem tokeniza é o SDK dele.
  function cartao(fd: FormData) {
    const [mm, aa] = validade.split("/").map(Number);
    const venc = new Date(2000 + (aa || 0), mm || 0, 0);
    if (!luhn(digitos)) return setErroCartao("Número do cartão inválido.");
    if (!mm || mm > 12 || venc < new Date()) return setErroCartao("Validade inválida.");
    if (!/^\d{3,4}$/.test(cvv)) return setErroCartao("Código de segurança inválido.");
    setErroCartao(null);
    const envio = new FormData();
    envio.set("valor", String(fd.get("valor")));
    envio.set("final", digitos.slice(-4));
    envio.set("bandeira", bandeira(digitos));
    enviarCartao(envio);
    setNumero("");
    setCvv("");
  }

  return (
    <div className="box">
      <div className="box-title">Adicionar crédito</div>
      <div className="amounts">
        {VALORES.map((v) => (
          <button key={v} type="button" className={valor === v ? "on" : ""} onClick={() => setValor(v)}>{v / 100}</button>
        ))}
      </div>
      <div className="paym">
        <button type="button" className={metodo === "pix" ? "on" : ""} onClick={() => setMetodo("pix")}><Ic n="pix" />Pix</button>
        <button type="button" className={metodo === "cartao" ? "on" : ""} onClick={() => setMetodo("cartao")}><Ic n="card" />Cartão</button>
      </div>
      {metodo === "pix" ? (
        <form action={enviarPix}>
          <input type="hidden" name="valor" value={valor} />
          {rPix && !rPix.ok && <div className="aviso erro">{rPix.texto}</div>}
          <button className="btn btn-volt btn-block" disabled={gerando}><Ic n="pix" />{gerando ? "Gerando..." : `Gerar Pix de ${brl(valor)}`}</button>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>O saldo cai na hora, assim que o banco confirmar.</div>
        </form>
      ) : (
        <form action={cartao}>
          <input type="hidden" name="valor" value={valor} />
          {simulado && <div className="aviso info">Ambiente de teste: nenhum cartão é cobrado. Final 0000 simula recusa.</div>}
          <div className="field"><label htmlFor="num">Número do cartão</label>
            <input className="input mono" id="num" inputMode="numeric" autoComplete="cc-number" maxLength={23} value={numero}
              onChange={(e) => setNumero(e.target.value.replace(/[^\d ]/g, ""))} placeholder="0000 0000 0000 0000" required />
          </div>
          <div className="two">
            <div className="field"><label htmlFor="val">Validade</label>
              <input className="input mono" id="val" inputMode="numeric" autoComplete="cc-exp" maxLength={5} value={validade}
                onChange={(e) => setValidade(e.target.value.replace(/[^\d/]/g, ""))} placeholder="MM/AA" required />
            </div>
            <div className="field"><label htmlFor="cvv">CVV</label>
              <input className="input mono" id="cvv" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, ""))} required />
            </div>
          </div>
          {erroCartao && <div className="aviso erro">{erroCartao}</div>}
          {rCartao && <div className={`aviso ${rCartao.ok ? "ok" : "erro"}`}>{rCartao.texto}</div>}
          <button className="btn btn-volt btn-block" disabled={pagando}>{pagando ? "Processando..." : `Adicionar ${brl(valor)}`}</button>
        </form>
      )}
    </div>
  );
}
