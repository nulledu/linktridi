"use client";

// ── Código de supervisor (recusa no tablet) ──────────────────────────────────
//
// O tablet da bancada não deixa mais recusar atividade sozinho: trava e pede o
// código de um supervisor, como o cancelamento no caixa do supermercado. Aqui
// quem tem Atividades › Autorizar (ou admin) cria/troca o seu. Só o hash vai
// pro banco; o código IDENTIFICA a pessoa, por isso não pode repetir.
// Servidor: app/api/atividades/codigo-supervisor · lib/atividades-autorizacao.ts

import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Botao, CampoOTP, type EstadoOTP } from "../ui/controles";
import { Alerta } from "../ui/Alerta";
import { toast } from "../Toast";

const TAMANHO = 6;

export function BotaoCodigoSupervisor() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Botao variante="secundario" tamanho="sm" icone="lock" onClick={() => setAberto(true)}>Código de supervisor</Botao>
      {aberto && <CodigoSupervisor onFechar={() => setAberto(false)} />}
    </>
  );
}

function CodigoSupervisor({ onFechar }: { onFechar: () => void }) {
  const [info, setInfo] = useState<{ tem: boolean; semTabela?: boolean } | null>(null);
  const [pin, setPin] = useState("");
  const [conf, setConf] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sinal, setSinal] = useState(0);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/atividades/codigo-supervisor", { cache: "no-store" })
      .then((r) => r.json()).then(setInfo).catch(() => setInfo({ tem: false }));
  }, []);

  const confere = pin.length === TAMANHO && conf.length === TAMANHO;
  const diferentes = confere && pin !== conf;
  const estado: EstadoOTP = erro || diferentes ? "erro" : "ocioso";

  async function salvar() {
    if (!confere || diferentes) return;
    setSalvando(true); setErro(null);
    try {
      const r = await fetch("/api/atividades/codigo-supervisor", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { toast.ok("Código de supervisor salvo. Use no tablet pra liberar uma recusa."); onFechar(); return; }
      setErro(d.error === "sem_tabela" ? "Falta rodar o SQL atividades_autorizacao no Supabase." : d.detalhe || "Não foi possível salvar agora.");
      setSinal((n) => n + 1);
    } catch {
      setErro("A conexão caiu. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onFechar={onFechar} icone="lock" tamanho="sm"
      titulo={info?.tem ? "Trocar código de supervisor" : "Criar código de supervisor"}
      subtitulo="Quando alguém quiser recusar uma atividade, o tablet trava até você digitar este código e decidir."
      rodape={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", width: "100%" }}>
          <Botao variante="sutil" onClick={onFechar} disabled={salvando}>Fechar</Botao>
          <Botao variante="primario" icone="check" onClick={salvar} carregando={salvando} disabled={!confere || diferentes}>Salvar código</Botao>
        </div>
      }>
      <div style={{ display: "grid", gap: 18 }}>
        {info?.semTabela && <Alerta tom="atencao" role="note">Falta rodar o SQL <strong>atividades_autorizacao</strong> no Supabase.</Alerta>}
        {info?.tem && <Alerta tom="info" role="note">Você já tem um código. Salvar um novo substitui o antigo.</Alerta>}
        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Novo código ({TAMANHO} números)</span>
          <CampoOTP length={TAMANHO} mascara autoFoco valor={pin} aoMudar={(v) => { setPin(v); setErro(null); }} estado={estado} sinal={sinal} />
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Repita o código</span>
          <CampoOTP length={TAMANHO} mascara valor={conf} aoMudar={(v) => { setConf(v); setErro(null); }} estado={estado} sinal={sinal} />
        </div>
        {(erro || diferentes) && (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--tf-neg)", fontWeight: 600 }}>
            {erro ?? "Os dois códigos não batem."}
          </p>
        )}
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)" }}>
          É pessoal: o tablet registra quem liberou cada recusa. Não use sequências (1234) nem repetidos (1111).
        </p>
      </div>
    </Modal>
  );
}
