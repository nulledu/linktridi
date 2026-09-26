-- ── Etiqueta do galpão: 15mm → 18mm ─────────────────────────────────────────
--
-- O dono pediu: "aumenta um pouco a etiqueta pra ficar com 18mm". O padrão já
-- mudou nos dois lados do código (EtiquetaLayout.ALTURA_PADRAO_MM no tablet e
-- CONFIG_IMPRESSAO_PADRAO em lib/estoque-etiqueta-config.ts), mas o valor que
-- MANDA é o gravado aqui: ele desce pro tablet pelo bootstrap e a web o lê pra
-- desenhar a prévia. Sem esta linha, o padrão novo só valeria num galpão que
-- ainda não tivesse configurado nada.
--
-- ── O CRITÉRIO, que é a parte que importa ───────────────────────────────────
--
-- Só troca quem está EXATAMENTE em 15 — o valor do padrão antigo. Quem digitou
-- 12, 20 ou 30 escolheu de propósito, provavelmente medindo o rolo que tem na
-- gaveta, e um UPDATE geral apagaria essa decisão em silêncio. O sintoma
-- apareceria como etiqueta cortada no meio, dias depois, sem ninguém ligar uma
-- coisa à outra.
--
-- Consequência assumida: um galpão que digitou 15 À MÃO, de propósito, também é
-- levado pra 18. Não há como distinguir "15 porque era o padrão" de "15 porque
-- eu quis" — a coluna guarda o número, não a intenção. Entre os dois erros
-- possíveis, mexer em quem não escolheu nada é o barato: são 3mm a mais numa
-- tira que continua imprimindo, e a tela de configuração mostra o valor e deixa
-- voltar em um toque.
--
-- Idempotente: rodar duas vezes não faz nada na segunda (o primeiro UPDATE já
-- tirou as linhas do filtro). Tolerante: se a coluna ainda não existir, avisa e
-- sai em vez de estourar — o código já trata a ausência dela.

do $$
declare
  mexidas int;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'estoque_config'
       and column_name  = 'etiqueta_altura_mm'
  ) then
    raise notice 'estoque_config.etiqueta_altura_mm ainda não existe — rode supabase/estoque_pendente_tudo.sql antes. Nada foi alterado.';
    return;
  end if;

  update public.estoque_config
     set etiqueta_altura_mm = 18,
         etiqueta_atualizado_em = now()
   where etiqueta_altura_mm = 15;

  get diagnostics mexidas = row_count;

  if mexidas = 0 then
    raise notice 'Nenhuma linha em 15mm — ou já está em 18, ou alguém escolheu outra altura de propósito. Nada foi alterado.';
  else
    raise notice 'Etiqueta do galpão: % linha(s) de 15mm passaram para 18mm.', mexidas;
  end if;
end $$;
